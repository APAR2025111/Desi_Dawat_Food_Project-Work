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

The public menu shows only rows where `is_available = 1`.
The admin can add, edit, show/hide, and delete items. Changes are stored in MySQL.

## Notes
- The browser never connects directly to MySQL. It calls the Express API.
- Admin API endpoints require a JWT obtained by logging in.
- This is a local development starter. Before public production deployment, use HTTPS, a strong unique admin password/JWT secret, backups, and production-grade hosting/secrets management.
- The backend expects the existing `menu_items` table. It does not automatically drop or overwrite your tables.
