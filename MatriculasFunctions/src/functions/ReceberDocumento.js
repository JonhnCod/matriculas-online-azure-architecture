const { app, input } = require('@azure/functions');
const df = require('durable-functions');
const mssql = require('mssql');
const { BlobServiceClient } = require("@azure/storage-blob"); // SDK para o Blob Storage

const dbConfigDoc = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};
const clientInputDoc = input.generic({ type: 'durableClient' });

app.http('receberDocumento', {
    methods: ['POST'],
    authLevel: 'anonymous',
    extraInputs: [clientInputDoc],
    handler: async (request, context) => {
        const estudanteId = request.query.get('id');
        if (!estudanteId) {
            return { status: 400, jsonBody: { message: "ID do estudante é obrigatório." } };
        }
        
        try {
            // LÓGICA REAL PARA UPLOAD DE FICHEIRO
            const formData = await request.formData();
            const file = formData.get('documento'); // 'documento' é o 'name' do seu input no HTML

            if (!file) {
                return { status: 400, jsonBody: { message: "Nenhum ficheiro enviado." } };
            }

            // Conecta-se ao seu Blob Storage usando a connection string do local.settings.json
            const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AzureWebJobsStorage);
            const containerClient = blobServiceClient.getContainerClient('documentos-matricula');
            await containerClient.createIfNotExists(); // Cria o "diretório" se ele não existir

            // Cria um nome único para o ficheiro para evitar sobreposições
            const blobName = `${estudanteId}-${file.name}`;
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);

            // Faz o upload dos dados do ficheiro
            const fileBuffer = Buffer.from(await file.arrayBuffer());
            await blockBlobClient.uploadData(fileBuffer);
            
            context.log(`Documento '${blobName}' salvo no Blob Storage para o estudante ID: ${estudanteId}`);

            // ATUALIZA O BANCO DE DADOS E INICIA A ORQUESTRAÇÃO (como antes)
            await mssql.connect(dbConfigDoc);
            await mssql.query`UPDATE USUARIO SET StatusDocumento = 'RECEBIDO' WHERE ID = ${estudanteId}`;
            
            const result = await mssql.query`SELECT StatusPagamento FROM USUARIO WHERE ID = ${estudanteId}`;
            
            if (result.recordset[0]?.StatusPagamento === 'APROVADO') {
                context.log(`Pagamento já estava aprovado. A iniciar orquestração para estudante ${estudanteId}...`);
                const client = df.getClient(context, clientInputDoc);
                await client.startNew("orquestradorDeMatricula", { input: estudanteId });
            }

            return { status: 200, jsonBody: { message: "Documento recebido com sucesso." } };

        } catch (error) {
            context.log.error("ERRO em receberDocumento:", error);
            return { status: 500, jsonBody: { message: "Erro ao processar documento." } };
        }
    }
});