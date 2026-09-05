const bcrypt = require('bcrypt');

async function generateHash() {
  const password = 'SuperAdmin@2024!HK';
  const hash = await bcrypt.hash(password, 10);
  console.log(hash);
}

generateHash();
