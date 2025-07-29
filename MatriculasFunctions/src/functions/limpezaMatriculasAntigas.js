const { app } = require('@azure/functions');
const mssql = require('mssql');

// Configuração do banco de dados (a mesma das suas outras funções)
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

// Definição da função com gatilho de tempo (Timer Trigger)
app.timer('limpezaMatriculasAntigas', {
    // A configuração de agendamento no formato CRON
    // Este exemplo executa a função todos os dias às 4:00 da manhã (UTC)
    schedule: '0 0 4 * * *', 
    handler: async (myTimer, context) => {
        
        const diasAtras = 30; // Define o período para considerar uma matrícula "antiga"
        context.log(`INICIANDO FUNÇÃO DE LIMPEZA: Apagando matrículas pendentes com mais de ${diasAtras} dias.`);

        try {
            await mssql.connect(dbConfig);

            // Comando SQL para deletar os registros antigos e pendentes
            const result = await mssql.query`
                DELETE FROM USUARIO
                WHERE 
                    (StatusPagamento = 'PENDENTE' OR StatusDocumento = 'PENDENTE')
                    AND DataDeCriacao < DATEADD(day, -${diasAtras}, GETDATE())
            `;
            
            // A propriedade 'rowsAffected' nos diz quantos registros foram apagados
            const registrosApagados = result.rowsAffected[0];

            if (registrosApagados > 0) {
                context.log(`LIMPEZA CONCLUÍDA: ${registrosApagados} registro(s) de matrículas pendentes antigas foram apagado(s).`);
            } else {
                context.log('LIMPEZA CONCLUÍDA: Nenhum registro antigo para apagar.');
            }

        } catch (error) {
            context.error("ERRO durante a execução da função de limpeza:", error);
        }
    }
});
