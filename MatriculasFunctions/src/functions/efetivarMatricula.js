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

df.app.activity('efetivarMatricula', {
    handler: async (estudanteId, context) => {
        context.log(`ATIVIDADE FINAL: Efetivando matrícula para Estudante ID: ${estudanteId}`);
        try {
            await mssql.connect(dbConfig);
            // Atualiza ambos os status para o estado final 'EFETIVADO'
            await mssql.query`
                UPDATE USUARIO 
                SET 
                    StatusPagamento = 'APROVADO', 
                    StatusDocumento = 'APROVADO'
                WHERE ID = ${estudanteId}
            `;
            context.log(`Matrícula do Estudante ID ${estudanteId} efetivada com sucesso no banco.`);
            return { status: "Efetivado" };
        } catch (error) {
            context.error(`Erro ao efetivar matrícula para ID ${estudanteId}:`, error);
            throw error;
        }
    }
});