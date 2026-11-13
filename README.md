# Desi Dawat Full-Stack Menu

React + Vite frontend, Express backend, and MySQL database connection.

## Requirements
- Node.js 20+ recommended
- MySQL Server running locally
- MySQL Workbench (for checking the database)

## 1. Database
The project expects your existing database and table:

- Database: `desi_dawat_menu`
- Table: `menu_items`
- Columns: `item_id`, `main_category`, `subcategory`, `item_name`,
  `quantity_serving`, `price_eur`, `short_information`, `is_available`

If your 38 rows are already imported, do not import the CSV again.

If needed, run `database/check.sql` in MySQL Workbench. It only checks the schema and row count.

## 2. Configure the backend
Open a terminal in VS Code in this project folder:

```powershell
cd backend
Copy-Item .env.example .env
```

Edit `backend/.env` and enter your local MySQL username/password and a long random JWT secret.
Do not share `.env` or commit it to GitHub.

Example:
```env
PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=desi_dawat_menu
JWT_SECRET=replace-this-with-a-long-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-password
FRONTEND_ORIGIN=http://localhost:5173
```

## 3. Install dependencies
Open two VS Code terminals.

Terminal 1:
```powershell
cd backend
npm install
npm run dev
```

Terminal 2:
```powershell
cd frontend
npm install
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173`.

## 4. Use the website
- Customer menu: `http://localhost:5173`
- Admin page: `http://localhost:5173/admin`
- Sign in using `ADMIN_USERNAME` and `ADMIN_PASSWORD` from `backend/.env`.

## Business documents and local AI drafts

- Apply `database/migrations/009_add_business_documents.sql` to the local `desi_dawat_menu` database before opening Admin → Document Management.
- Uploaded PDF, Word, OpenDocument, and plain-text files are stored in `backend/private-documents` by default. This directory is not exposed through the public `/uploads` route. Back it up with the database. For deployment, set `DOCUMENT_STORAGE_DIR` to durable private storage.
- The local AI draft form connects from the backend to Ollama at `http://127.0.0.1:11434`. Start Ollama and install at least one model locally. Set `OLLAMA_BASE_URL` only to a loopback address. The API rejects non-local hosts.
- Only the title, business context, and drafting instructions entered in the form are sent to Ollama. Uploaded document contents are not submitted to the model.

## Menu item codes

- Apply `database/migrations/010_add_menu_display_codes.sql` and then `database/migrations/011_randomize_menu_item_numbers.sql` to the local `desi_dawat_menu` database. The printed numbers 1–23 are retained; remaining dishes are randomly ordered and assigned consecutive numbers from 24 onward.
- Apply `database/migrations/019_expand_order_item_name.sql` to allow long bilingual dish names plus their menu numbers in saved orders.
- Admins can edit item numbers in Menu Management. Leave the field blank for a new dish to receive the next consecutive number.
- Generated drafts are editable and saved as plain-text documents. Review factual, operational, and regulatory details before using a draft.

## Registered-customer surprise rewards

- Apply `database/migrations/018_add_surprise_rewards.sql` to the local `desi_dawat_menu` database before using surprise rewards.
- Configure the 15-position reward cycle, free add-on dish pool, and coupon validity in Admin → Rewards Management. Each signed-in order with a food subtotal over €30 advances the shared cycle; guests do not advance it. Coupons can be selected at checkout and expire after the validity period set by the admin (15 days by default).

The public menu shows only rows where `is_available = 1`.
The admin can add, edit, show/hide, and delete items. Changes are stored in MySQL.

## Notes
- The browser never connects directly to MySQL. It calls the Express API.
- Admin API endpoints require a JWT obtained by logging in.
- This is a local development starter. Before public production deployment, use HTTPS, a strong unique admin password/JWT secret, backups, and production-grade hosting/secrets management.
- The backend expects the existing `menu_items` table. It does not automatically drop or overwrite your tables.

## Automated checks

Frontend unit tests and production build (from `frontend`):

```powershell
npm test
npm run build
```

Backend API integration checks (from `backend`, no database needed):

```powershell
npm test
```

Browser customer journey and mobile layout checks (from `frontend`):

```powershell
npx playwright install chromium
npm run test:e2e
```

For Hostinger app roots, build settings, environment variables, migration preflight, backup, and release guidance, see [DEPLOYMENT.md](./DEPLOYMENT.md). Review [PROJECT_AUDIT.md](./PROJECT_AUDIT.md) for known risks and what still needs staging verification.
