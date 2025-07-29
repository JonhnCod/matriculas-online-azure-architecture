const df = require('durable-functions');
const moment = require('moment');

df.app.orchestration('orquestradorDeMatricula', function* (context) {
    const log = (message) => context.log(message);
    const { estudanteId } = context.df.getInput();
    log(`==> INÍCIO: Orquestração para Estudante ID: ${estudanteId}`);

    // Espera pelos eventos ou por um timeout de 24h
    const prazoFinal = moment.utc(context.df.currentUtcDateTime).add(24, 'h');
    const timeoutTask = context.df.createTimer(prazoFinal.toDate());
    const pagamentoTask = context.df.waitForExternalEvent("PagamentoRecebido");
    const documentoTask = context.df.waitForExternalEvent("DocumentoRecebido");

    const allEventsTask = context.df.Task.all([pagamentoTask, documentoTask]);
    const winnerTask = yield context.df.Task.any([allEventsTask, timeoutTask]);

    if (winnerTask === timeoutTask) {
        log(`TIMEOUT: Matrícula para ${estudanteId} cancelada.`);
        return "Expirado";
    }

    log(`Dados recebidos para Estudante ID: ${estudanteId}. Disparando validações em segundo plano.`);
    
    // Dispara as validações em paralelo
    const validarPagamentoTask = context.df.callActivity("validarPagamento", estudanteId);
    const validarDocumentosTask = context.df.callActivity("validarDocumentos", estudanteId);
    yield context.df.Task.all([validarPagamentoTask, validarDocumentosTask]);

    // Verifica o resultado final no banco
    const statusGeral = yield context.df.callActivity("verificarStatusMatricula", estudanteId);

    if (!statusGeral.pagamentoOk || !statusGeral.documentosOk) {
        const erroMsg = `Matrícula para ${estudanteId} REJEITADA.`;
        yield context.df.callActivity("notificarEstudante", { estudanteId: estudanteId, assunto: "Problema na sua Matrícula", mensagem: erroMsg });
        return "Rejeitado";
    }

    log(`Validação Aprovada para ${estudanteId}. Finalizando processo.`);
    
    // Fluxo final
    const urlContrato = yield context.df.callActivity("gerarContrato", estudanteId);
    yield context.df.callActivity("liberarAcessoConsulta", estudanteId);
    yield context.df.callActivity("notificarEstudante", {
        estudanteId: estudanteId,
        assunto: "Bem-vindo(a)! Matrícula Efetivada!",
        mensagem: `Parabéns! Seu processo foi concluído. Contrato: ${urlContrato}`
    });

    yield context.df.callActivity("efetivarMatricula", estudanteId);

    log(`==> FIM: Orquestração para ${estudanteId} concluída.`);
    return "Matrícula Concluída";
});