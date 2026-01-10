import buildApp from './app.js';
import SERVER from '../config/env.js';

const app = buildApp();
const PORT = SERVER.PORT

app.listen(PORT, () => {
  console.log(`Verse API running on port ${PORT}`);
});