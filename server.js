const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const multer = require('multer');
require('dotenv').config(); // Carrega as variáveis do .env

// Inicializa o Firebase
const serviceAccount = {
  type: 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Substitui \n por uma quebra de linha
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // Nome do seu bucket
  databaseURL: process.env.FIREBASE_DATABASE_URL // URL do seu Realtime Database
});

const db = admin.database();
const app = express();
const PORT = process.env.PORT || 5000;

// Configuração de CORS para permitir localhost e futuras origens de produção
const allowedOrigins = ['http://localhost:5173', 'https://sua-app-em-producao.com', 'http://10.0.0.104:5173'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origin não permitida pelo CORS'));
    }
  },
  methods: ['GET', 'POST'],
  credentials: true // Habilita cookies e credenciais
}));

app.use(bodyParser.json());

// Configurar o multer para lidar com uploads de arquivos (armazenados na memória antes de enviar para o Firebase)
const storage = multer.memoryStorage(); // Armazena o arquivo na memória antes de enviá-lo para o Firebase
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 } // Limite de 10MB para o arquivo
});

// Rota para upload de flyers (agora suporta tanto imagem quanto vídeo)
app.post('/upload-flyer', upload.single('file'), async (req, res) => {
  const { name, day, title } = req.body; // Inclui o campo 'title'
  const file = req.file; // O arquivo enviado

  try {
    if (!file) {
      return res.status(400).send({ message: 'Nenhum arquivo enviado' });
    }

    // Definir caminho do arquivo no Firebase Storage
    const filePath = `flyers/${day}/${name}_${Date.now()}`;

    // Verificar se é um vídeo ou imagem
    const isVideo = file.mimetype.startsWith('video'); // Adicione '/' para garantir a verificação correta

    // Salva o arquivo no Firebase Storage
    const bucket = admin.storage().bucket();
    const fileUpload = bucket.file(filePath);

    await fileUpload.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
    });

    // Gera URL pública para o arquivo salvo
    const fileUrl = await fileUpload.getSignedUrl({
      action: 'read',
      expires: '03-01-2500', // Expiração do link
    });

    // Armazena as informações no Realtime Database
    const flyerRef = db.ref('flyers').push(); // Cria uma nova referência
    await flyerRef.set({
      title,   // Título adicionado
      name,
      day,
      url: fileUrl[0],
      isVideo,  // Adiciona flag para identificar se é vídeo
      createdAt: admin.database.ServerValue.TIMESTAMP, // Usa o timestamp do servidor
    });

    res.status(201).send({ message: 'Flyer enviado com sucesso', id: flyerRef.key, url: fileUrl[0] });
  } catch (error) {
    console.error('Erro ao enviar o flyer:', error);
    res.status(500).send({ message: 'Erro ao enviar o flyer' });
  }
});


// Rota para buscar flyers por dia
app.get('/flyers/:day', async (req, res) => {
  const { day } = req.params;

  try {
    const flyersSnapshot = await db.ref('flyers').orderByChild('day').equalTo(day).once('value');
    const flyers = [];

    flyersSnapshot.forEach((childSnapshot) => {
      flyers.push({ id: childSnapshot.key, ...childSnapshot.val() });
    });

    res.status(200).send(flyers);
  } catch (error) {
    console.error('Erro ao buscar flyers:', error);
    res.status(500).send({ message: 'Erro ao buscar flyers' });
  }
});

app.post('/upload-gallery-media', upload.single('file'), async (req, res) => {
  const { title, date } = req.body; // Adicione o título e a data
  const file = req.file; // O arquivo enviado

  try {
    if (!file) {
      return res.status(400).send({ message: 'Nenhum arquivo enviado' });
    }

    const filePath = `gallery/${file.originalname}_${Date.now()}`; // Define o caminho do arquivo
    const isVideo = file.mimetype.startsWith('video'); // Verifica se é um vídeo com base no tipo MIME

    // Salva o arquivo no Firebase Storage
    const bucket = admin.storage().bucket();
    const fileUpload = bucket.file(filePath);

    await fileUpload.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
    });

    const fileUrl = await fileUpload.getSignedUrl({
      action: 'read',
      expires: '03-01-2500', // Expiração do link
    });

    // Armazena a URL e outras informações no Realtime Database
    const mediaRef = db.ref('galleryMedia').push(); // Cria uma nova referência
    await mediaRef.set({
      title,  // Título do evento
      date,   // Data do evento
      name: file.originalname,
      url: fileUrl[0],
      isVideo,  // Adiciona flag para identificar se é vídeo
      createdAt: admin.database.ServerValue.TIMESTAMP, // Usa o timestamp do servidor
    });

    res.status(201).send({ message: 'Mídia enviada com sucesso', id: mediaRef.key, url: fileUrl[0] });
  } catch (error) {
    console.error('Erro ao enviar a mídia:', error);
    res.status(500).send({ message: 'Erro ao enviar a mídia' });
  }
});

app.get('/gallery-media', async (req, res) => {
  try {
    const mediaSnapshot = await db.ref('galleryMedia').once('value');
    const media = [];

    mediaSnapshot.forEach((childSnapshot) => {
      media.push({ id: childSnapshot.key, ...childSnapshot.val() });
    });

    res.status(200).send(media);
  } catch (error) {
    console.error('Erro ao buscar mídias:', error);
    res.status(500).send({ message: 'Erro ao buscar mídias' });
  }
});

app.post('/contato', async (req, res) => {
  const { name, email, message, celular } = req.body;

  try {
    if (!name || !email || !message || !celular) {
      return res.status(400).send({ message: 'Todos os campos são obrigatórios' });
    }

    // Armazena as informações de contato no Firebase Realtime Database
    const contatoRef = db.ref('contatos').push(); // Cria uma nova referência
    await contatoRef.set({
      name,
      email,
      message,
      celular,
      createdAt: admin.database.ServerValue.TIMESTAMP, // Usa o timestamp do servidor
    });

    res.status(201).send({ message: 'Contato enviado com sucesso', id: contatoRef.key });
  } catch (error) {
    console.error('Erro ao enviar o contato:', error);
    res.status(500).send({ message: 'Erro ao enviar o contato' });
  }
});

// Rota para buscar todas as mensagens de contato (GET)
app.get('/contato', async (req, res) => {
  try {
    const contatosSnapshot = await db.ref('contatos').once('value');
    const contatos = [];

    contatosSnapshot.forEach((childSnapshot) => {
      contatos.push({ id: childSnapshot.key, ...childSnapshot.val() });
    });

    res.status(200).send(contatos);
  } catch (error) {
    console.error('Erro ao buscar contatos:', error);
    res.status(500).send({ message: 'Erro ao buscar contatos' });
  }
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor está rodando na porta ${PORT}`);
});
