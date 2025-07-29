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

df.app.activity('validarPagamento', {
    handler: async (estudanteId, context) => {
        context.log(`ATIVIDADE: Validando pagamento para Estudante ID: ${estudanteId}`);
        try {
            const pagamentoFoiValidado = true;
            const statusFinal = pagamentoFoiValidado ? 'VALIDADO' : 'REJEITADO';

            await mssql.connect(dbConfig);
            await mssql.query`UPDATE USUARIO SET StatusPagamento = ${statusFinal} WHERE ID = ${estudanteId}`;

            context.log(`Status do pagamento para ID ${estudanteId} atualizado para ${statusFinal}.`);
            return { status: statusFinal };
        } catch (error) {
            context.error(`Erro ao validar pagamento para ID ${estudanteId}:`, error);
            throw error;
        }
    }
});