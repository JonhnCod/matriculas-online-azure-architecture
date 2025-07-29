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

app.http('RealizarPagamento', {
    methods: ['POST'],
    authLevel: 'anonymous',
    extraInputs: [clientInput],
    handler: async (request, context) => {
        try {
            const { cpf, idempotencyKey } = await request.json();

            if (!cpf) return { status: 400, jsonBody: { message: "CPF obrigatório." } };
            if (!idempotencyKey) return { status: 400, jsonBody: { message: "idempotencyKey obrigatório." } };

            await mssql.connect(dbConfig);

            // 1. Verifica se essa chave já foi processada
            const existing = await mssql.query`
                SELECT ResultadoJson FROM IdempotencyKeys WHERE IdempotencyKey = ${idempotencyKey};
            `;
            if (existing.recordset.length > 0) {
                context.log(`Requisição duplicada para pagamento detectada, retornando resultado salvo.`);
                return { status: 200, jsonBody: JSON.parse(existing.recordset[0].ResultadoJson) };
            }

            // 2. Insere registro de chave para bloquear duplicidade
            await mssql.query`
                INSERT INTO IdempotencyKeys (IdempotencyKey, CriadoEm, Status)
                VALUES (${idempotencyKey}, GETUTCDATE(), 'PENDENTE');
            `;

            // 3. Busca estudante pelo CPF
            const userResult = await mssql.query`
                SELECT ID FROM USUARIO WHERE CPF = ${cpf};
            `;
            if (!userResult.recordset[0]) {
                return { status: 404, jsonBody: { message: "Estudante não encontrado." } };
            }
            const estudanteId = userResult.recordset[0].ID;

            // 4. Atualiza status do pagamento
            await mssql.query`
                UPDATE USUARIO SET StatusPagamento = 'APROVADO' WHERE ID = ${estudanteId};
            `;

            // 5. Dispara evento para orquestração
            const client = df.getClient(context, clientInput);
            const instanceId = `matricula-${estudanteId}`;
            await client.raiseEvent(instanceId, "PagamentoRecebido", { status: "Aprovado" });

            context.log(`Evento 'PagamentoRecebido' enviado para a instância '${instanceId}'.`);

            // 6. Atualiza registro da chave com resultado
            const resultado = { message: "Pagamento recebido.", estudanteId };
            await mssql.query`
                UPDATE IdempotencyKeys
                SET ResultadoJson = ${JSON.stringify(resultado)}, Status = 'CONCLUIDO'
                WHERE IdempotencyKey = ${idempotencyKey};
            `;

            return { status: 202, jsonBody: resultado };

        } catch (error) {
            context.error("ERRO em RealizarPagamento:", error);

            // Tenta recuperar resultado se erro de duplicidade na chave
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

            return { status: 500, jsonBody: { message: "Erro ao processar pagamento." } };
        }
    }
});
