import { openDb, closeDb } from './index.js';

openDb();
closeDb();
console.log('migrations applied');
