import * as bcrypt from 'bcrypt';

const password = 'SuperAdmin@2024!HK';
const hash = await bcrypt.hash(password, 10);
console.log(hash);
