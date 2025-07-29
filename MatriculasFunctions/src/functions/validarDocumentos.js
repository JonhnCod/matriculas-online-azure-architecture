const df = require('durable-functions');
const mssql = require('mssql');

// Configuração do DB dentro do próprio arquivo
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

df.app.activity('validarDocumentos', {
    handler: async (estudanteId, context) => {
        context.log(`ATIVIDADE: Validando documentos para Estudante ID: ${estudanteId}`);
        try {
            const documentosSaoValidos = true; 
            const statusFinal = documentosSaoValidos ? 'VALIDADO' : 'REJEITADO';

            await mssql.connect(dbConfig);
            await mssql.query`UPDATE USUARIO SET StatusDocumento = ${statusFinal} WHERE ID = ${estudanteId}`;
            
            context.log(`Status dos documentos para ID ${estudanteId} atualizado para ${statusFinal}.`);
            return { status: statusFinal };
        } catch (error) {
            context.error(`Erro ao validar documentos para ID ${estudanteId}:`, error);
            throw error;
        }
    }
});