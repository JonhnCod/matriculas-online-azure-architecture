require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env
const express = require('express');
const mssql = require('mssql');
const cors = require('cors'); // Permite que seu frontend acesse o backend

// Inicializa o aplicativo Express
const app = express();
const port = process.env.PORT || 3000; // Usa a porta do ambiente ou 3000

// Configura os middlewares
app.use(cors()); // Habilita o CORS para todas as rotas
app.use(express.json()); // Habilita o Express para entender JSON no corpo das requisições
app.use(express.static('public')); // Serve arquivos estáticos da pasta 'public' (onde ficará o index.html)


// --- CONFIGURAÇÃO DO BANCO DE DADOS SQL SERVER ---
// As informações vêm do seu arquivo .env
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER, // ex: 'localhost' ou o endereço do servidor
    database: process.env.DB_DATABASE, // ex: 'VS-JONHN'
    options: {
        encrypt: true, // Para o Azure SQL, é recomendado
        trustServerCertificate: true // Mude para false em produção se tiver um certificado válido
    }
};

// --- ROTA DA API PARA SALVAR DADOS ---
// O frontend vai enviar uma requisição POST para '/api/usuarios'
app.post('/api/usuarios', async (req, res) => {
    // 1. Pega os dados enviados pelo frontend (ex: { nome: 'Jonathan', sobrenome: 'Silva', cpf: '12345678900' })
   
    const { nome, sobrenome, cpf } = req.body;

    // Validação simples para garantir que os dados foram enviados
    if (!nome || !sobrenome || !cpf) {
        return res.status(400).json({ message: 'Nome, Sobrenome e CPF são obrigatórios.' });
    }

    console.log(`Recebido pedido para inserir: Nome=${nome}, Sobrenome=${sobrenome}, CPF=${cpf}`);

    try {
        // 2. Conecta ao banco de dados usando um pool de conexões (melhor prática)
        let pool = await mssql.connect(dbConfig);
        console.log("Conectado ao SQL Server com sucesso!");

        // 3. Cria a query SQL usando parâmetros para evitar SQL Injection
        
        const query = `
            INSERT INTO USUARIO (NOME, SOBRENOME, CPF) 
            VALUES (@nomeParam, @sobrenomeParam, @cpfParam)
        `;

        // 4. Executa a query
        
        await pool.request()
            .input('nomeParam', mssql.NVarChar, nome)
            .input('sobrenomeParam', mssql.NVarChar, sobrenome)
            .input('cpfParam', mssql.NVarChar, cpf)
            .query(query);

        console.log("Usuário inserido com sucesso no banco de dados!");

        // 5. Envia uma resposta de sucesso para o frontend
        res.status(201).json({ message: 'Usuário criado com sucesso!' });

    } catch (err) {
        // Se der algum erro, informa no console e envia uma resposta de erro
        console.error('ERRO NO BANCO DE DADOS:', err);
        res.status(500).json({ message: 'Falha ao conectar ou inserir dados no banco.' });
    }
});


// Inicia o servidor para ouvir as requisições
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}. Acesse http://localhost:${port}`);
});