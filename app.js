import express from 'express';

import initWhatsAppClient from './platforms/whatsapp/client.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/', (req, res) => {
    res.json({ msg: 'Hi, your server is up and running' })
});

app.listen(PORT, () => {
    console.log(`Server is up and runing on port ${PORT}`)
});

const platformClients = async () => {
    try {
        await initWhatsAppClient();
    } catch (error) {

    }
};

await platformClients();