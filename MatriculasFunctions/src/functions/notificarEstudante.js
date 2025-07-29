const df = require('durable-functions');

df.app.activity('notificarEstudante', {
    handler: async (notificacao, context) => {
        const { estudanteId, assunto, mensagem } = notificacao;
        context.log(`ATIVIDADE: Enviando notificação para ${estudanteId}. Assunto: "${assunto}"`);
        return { status: "Notificação Enviada" };
    }
});