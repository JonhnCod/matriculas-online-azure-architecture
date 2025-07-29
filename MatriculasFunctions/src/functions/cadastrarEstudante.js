const { app, input } = require('@azure/functions');
const df = require('durable-functions');
const mssql = require('mssql');

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

const clientInput = input.generic({ type: 'durableClient' });

app.http('cadastrarEstudante', {
    methods: ['POST'],
    authLevel: 'anonymous',
    extraInputs: [clientInput],
    handler: async (request, context) => {
        context.log('Recebida requisição para cadastrar novo estudante e iniciar processo.');

        const { nome, sobrenome, cpf, curso, idempotencyKey } = await request.json();

        if (!nome || !sobrenome || !cpf || !curso) {
            return { status: 400, jsonBody: { message: "Nome, Sobrenome, CPF e Curso são obrigatórios." } };
        }
        if (!idempotencyKey) {
            return { status: 400, jsonBody: { message: "idempotencyKey é obrigatório." } };
        }

        try {
            await mssql.connect(dbConfig);

            // 1. Verifica se a chave já foi usada
            const existing = await mssql.query`
                SELECT EstudanteId, ResultadoJson FROM IdempotencyKeys WHERE IdempotencyKey = ${idempotencyKey};
            `;

            if (existing.recordset.length > 0) {
                const registro = existing.recordset[0];
                context.log(`Requisição duplicada detectada para idempotencyKey ${idempotencyKey}, retornando resultado salvo.`);
                return { status: 200, jsonBody: JSON.parse(registro.ResultadoJson) };
            }

            // 2. Insere chave no banco para bloquear duplicidades futuras
            await mssql.query`
                INSERT INTO IdempotencyKeys (IdempotencyKey, CriadoEm, Status)
                VALUES (${idempotencyKey}, GETUTCDATE(), 'PENDENTE');
            `;

            // 3. Insere o novo estudante
            const result = await mssql.query`
                INSERT INTO USUARIO (Nome, Sobrenome, CPF, Curso, StatusPagamento, StatusDocumento)
                OUTPUT INSERTED.ID
                VALUES (${nome}, ${sobrenome}, ${cpf}, ${curso}, 'PENDENTE', 'PENDENTE');
            `;
            const estudanteId = result.recordset[0].ID;
            context.log(`Estudante salvo com ID: ${estudanteId}.`);

            // 4. Inicia a orquestração
            const client = df.getClient(context, clientInput);
            const instanceId = `matricula-${estudanteId}`;
            await client.startNew("orquestradorDeMatricula", {
                instanceId: instanceId,
                input: { estudanteId }
            });
            context.log(`Orquestração iniciada com ID de instância: '${instanceId}'.`);

            // 5. Atualiza a chave idempotency com o resultado para futuras chamadas
            const resultado = { message: "Cadastro recebido, processo iniciado.", estudanteId };
            await mssql.query`
                UPDATE IdempotencyKeys
                SET EstudanteId = ${estudanteId}, ResultadoJson = ${JSON.stringify(resultado)}, Status = 'CONCLUIDO'
                WHERE IdempotencyKey = ${idempotencyKey};
            `;

            return { status: 202, jsonBody: resultado };

        } catch (error) {
            context.error("ERRO em cadastrarEstudante:", error);

            // Se for erro de chave duplicada (tentativa simultânea), tenta retornar resultado já salvo
            if (error.number === 2627 || error.message.includes('PRIMARY KEY')) {
                try {
                    const existing = await mssql.query`
                        SELECT ResultadoJson FROM IdempotencyKeys WHERE IdempotencyKey = ${idempotencyKey};
                    `;
                    if (existing.recordset.length > 0) {
                        return { status: 200, jsonBody: JSON.parse(existing.recordset[0].ResultadoJson) };
                    }
                } catch (e) {
                    context.error("Erro ao recuperar resultado da idempotencyKey duplicada:", e);
                }
                return { status: 409, jsonBody: { message: "Requisição duplicada detectada." } };
            }

            // Erros genéricos
            if (error.number === 2627) {
                return { status: 409, jsonBody: { message: "O CPF informado já está cadastrado." } };
            }

            return { status: 500, jsonBody: { message: "Erro ao salvar no banco de dados." } };
        }
    }
});
