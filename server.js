const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');
const multer = require('multer');

// Inicializa o Firebase
const serviceAccount = require('./accountService.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'experiencebackend.appspot.com',
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

const app = express();
const PORT = process.env.PORT || 5000;

// Configuração de CORS para permitir localhost e futuras origens de produção
const allowedOrigins = ['http://localhost:5173', 'https://sua-app-em-producao.com'];

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
  limits: { fileSize: 10 * 1024 * 1024 } // Limite de 10MB para o arquivo
});

// Rota para upload de flyers
app.post('/upload-flyer', upload.single('file'), async (req, res) => {
  const { name, day } = req.body;
  const file = req.file; // O arquivo enviado

  try {
    if (!file) {
      return res.status(400).send({ message: 'Nenhum arquivo enviado' });
    }

    const filePath = `flyers/${day}/${name}_${Date.now()}.png`;
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

    // Armazena a URL no Firestore
    const flyerRef = db.collection('flyers').doc();
    await flyerRef.set({
      name,
      day,
      url: fileUrl[0],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).send({ message: 'Flyer enviado com sucesso', id: flyerRef.id, url: fileUrl[0] });
  } catch (error) {
    console.error('Erro ao enviar o flyer:', error);
    res.status(500).send({ message: 'Erro ao enviar o flyer' });
  }
});

// Rota para buscar flyers por dia
app.get('/flyers/:day', async (req, res) => {
  const { day } = req.params;

  try {
    const flyersSnapshot = await db.collection('flyers').where('day', '==', day).get();
    const flyers = [];

    flyersSnapshot.forEach((doc) => {
      flyers.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).send(flyers);
  } catch (error) {
    console.error('Erro ao buscar flyers:', error);
    res.status(500).send({ message: 'Erro ao buscar flyers' });
  }
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor está rodando na porta ${PORT}`);
});
