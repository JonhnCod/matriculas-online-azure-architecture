const df = require('durable-functions');

df.app.activity('liberarAcessoConsulta', {
    handler: async (estudanteId, context) => {
        context.log(`ATIVIDADE: Liberando acesso para outros sistemas para Estudante ID: ${estudanteId}`);
        return { status: "Acesso Liberado" };
    }
});
