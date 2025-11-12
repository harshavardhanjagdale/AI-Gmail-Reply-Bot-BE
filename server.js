require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// routes
app.use('/auth', require('./routes/auth'));
app.use('/gmail', require('./routes/gmail'));

app.get('/', (req, res) => {
  res.json({ ok: true, message: "Email Action Bot Backend running" });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
