Here’s a complete **README.md** file you can copy directly into your project. It explains the project, how to run it locally, how to deploy to Vercel, and how to use the API.

```markdown
# Gender Classification API

A simple Express.js API that predicts the gender of a given first name using the [Genderize.io](https://genderize.io) service. The API is optimized for deployment on **Vercel** as a serverless function, but can also run locally.

## Features

- Accepts a `name` query parameter
- Returns gender, probability, sample size, and a confidence flag
- Handles missing or invalid input gracefully
- CORS enabled for cross‑origin requests
- Ready for Vercel deployment (serverless)

## Tech Stack

- Node.js
- Express.js
- CORS
- Genderize.io API
- Vercel (deployment)

---

## Getting Started (Local Development)

### 1. Clone or create the project folder

```bash
mkdir gender-api
cd gender-api
```

### 2. Initialize a Node.js project

```bash
npm init -y
```

### 3. Install dependencies

```bash
npm install express cors
```

### 4. Create the files

Create `server.js` and `vercel.json` in the root folder. Use the code provided in the next section.

### 5. Run the server locally

```bash
node server.js
```

The server will start on `http://localhost:3000`.

Test the endpoint:

```
http://localhost:3000/api/classify?name=john
```

You should see a JSON response like:

```json
{
  "status": "success",
  "data": {
    "name": "john",
    "gender": "male",
    "probability": 0.99,
    "sampleSize": 12345,
    "isConfident": true,
    "processedAt": "2025-01-15T10:30:00.000Z"
  }
}
```


### `package.json`

Make sure your `package.json` includes these dependencies:

```json
{
  "name": "gender-api",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  }
}
```

---

## Deploy to Vercel

You can deploy this API for free using Vercel. Two methods:

### Method 1: Vercel CLI

1. Install Vercel CLI globally:
   ```bash
   npm i -g vercel
   ```

2. Login:
   ```bash
   vercel login
   ```

3. From your project folder, run:
   ```bash
   vercel
   ```
   Follow the prompts (accept defaults for a new project).

4. For production:
   ```bash
   vercel --prod
   ```

### Method 2: GitHub + Vercel Dashboard

1. Push your code to a GitHub repository.
2. Go to [vercel.com](https://vercel.com), click **Add New → Project**.
3. Import your GitHub repo.
4. Click **Deploy** – Vercel automatically detects the configuration.

After deployment, your API will be available at:

```
https://your-project.vercel.app/api/classify?name=alex
```

---

## API Documentation

### Endpoint

```
GET /api/classify
```

### Query Parameter

| Parameter | Type   | Required | Description                  |
|-----------|--------|----------|------------------------------|
| `name`    | string | Yes      | First name to classify       |

### Response (Success – 200)

```json
{
  "status": "success",
  "data": {
    "name": "john",
    "gender": "male",
    "probability": 0.99,
    "sampleSize": 12345,
    "isConfident": true,
    "processedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

### Response (Client Error – 400)

```json
{
  "status": "error",
  "message": "Missing or empty name parameter"
}
```

### Response (Not Found – 404)

```json
{
  "status": "error",
  "message": "No prediction available for the provided name"
}
```

### Response (Server Error – 500)

```json
{
  "status": "error",
  "error": "An error occurred while processing the request."
}
```

---

## Environment Variables (Optional)

No API keys are required for the Genderize.io free tier. If you later switch to a paid plan, you can add an API key using Vercel environment variables.

Add a variable in Vercel:

```bash
vercel env add GENDERIZE_API_KEY
```

Then use it inside `server.js` (not needed for this basic version).

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `404` on `/api/classify` | Make sure you are using the exact path `/api/classify`. The root `/` returns a welcome message. |
| CORS errors in browser | `app.use(cors())` already allows all origins. If you need to restrict, modify the CORS configuration. |
| Function timeout on Vercel | Free tier has a 10s limit. Genderize.io is usually fast, but if the name database is huge, consider upgrading or adding a timeout. |
| Local server works, Vercel fails | Ensure you exported the app with `module.exports = app` and that `vercel.json` is present. Possibly try to deploy using CLI it is more beginner friendly|

---

## License

MIT – free to use and modify.

---

## Author

Created by [Your Name].  
For questions or contributions, open an issue on the GitHub repository.
