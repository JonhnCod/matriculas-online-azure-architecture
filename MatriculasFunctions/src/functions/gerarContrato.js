const df = require('durable-functions');
const PDFDocument = require('pdfkit');
const { BlobServiceClient } = require("@azure/storage-blob");
const mssql = require('mssql');

const dbConfigContrato = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

df.app.activity('gerarContrato', {
    handler: async (estudanteId, context) => {
        context.log(`ATIVIDADE: Gerando contrato para Estudante ID: ${estudanteId}`);
        
        try {
            // LÓGICA REAL PARA GERAR E SALVAR PDF
            // 1. Buscar os dados do estudante no banco
            await mssql.connect(dbConfigContrato);
            const studentResult = await mssql.query`SELECT Nome, Sobrenome, CPF FROM USUARIO WHERE ID = ${estudanteId}`;
            const studentData = studentResult.recordset[0];

            if (!studentData) {
                throw new Error(`Estudante com ID ${estudanteId} não encontrado.`);
            }

            // 2. Criar o documento PDF em memória
            const doc = new PDFDocument();
            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {});

            // Adiciona conteúdo ao PDF
            doc.fontSize(25).text('Contrato de Matrícula', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Este contrato é celebrado entre a PUCPR e o(a) estudante ${studentData.Nome} ${studentData.Sobrenome}, portador(a) do CPF ${studentData.CPF}.`);
            doc.moveDown();
            doc.text('O estudante declara estar ciente e de acordo com os termos de serviço da instituição.');
            doc.end();

            const pdfData = Buffer.concat(buffers);

            // 3. Salvar o PDF no Blob Storage
            const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AzureWebJobsStorage);
            const containerClient = blobServiceClient.getContainerClient('contratos');
            await containerClient.createIfNotExists();

            const blobName = `contrato-${estudanteId}.pdf`;
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.upload(pdfData, pdfData.length);

            context.log(`Contrato gerado e salvo em: ${blockBlobClient.url}`);
            
            // 4. Retornar a URL real do contrato salvo
            return blockBlobClient.url;

        } catch (error) {
            context.log.error("Erro ao gerar contrato:", error);
            // Lançar o erro faz com que a orquestração saiba que esta atividade falhou
            throw error;
        }
    }
});