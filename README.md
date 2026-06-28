# GigSpot 📍

GigSpot is a dynamic web app bridging local freelancers with businesses needing short-term labor. Built on Node.js, Express, and Supabase (PostgreSQL), it features interactive map-based job discovery, robust OTP email authentication, and dual user roles. Deployed serverlessly on Vercel, it offers a secure, seamless gig economy marketplace.

## Features

- **Map-Based Discovery**: Interactive map interface to find and post jobs geographically.
- **Dual User Roles**: Support for "Job Providers" (businesses/individuals needing help) and "Workers" (freelancers looking for gigs).
- **Secure Authentication**: Traditional login, Google OAuth, and secure OTP (One-Time Password) email verification powered by Nodemailer.
- **Real-Time Job Management**: Providers can post jobs, manage applicants, and review workers. Workers can browse local opportunities and build professional profiles.
- **Serverless Ready**: Designed to deploy natively on Vercel with lazy database initialization.

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL (via Supabase) with a local SQLite fallback for development.
- **Frontend**: Vanilla HTML5, CSS3, JavaScript
- **Deployment**: Vercel Serverless Functions

## Setup Instructions

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/DarshanBS8i/Gigspot.git
   cd Gigspot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add your credentials:
   ```env
   # Database connection (Supabase)
   DB_HOST=your-supabase-db-host
   DB_PORT=5432
   DB_NAME=postgres
   DB_USER=postgres
   DB_PASSWORD=your-secure-password

   # Email Authentication (Gmail)
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-16-character-app-password
   
   # JWT Secret
   JWT_SECRET=your-random-secure-secret
   ```

4. **Run the Application:**
   ```bash
   npm run dev
   ```
   The application will be running at `http://localhost:3000`.

### Vercel Deployment

This project is fully configured for Vercel deployment via the included `vercel.json` file.
1. Import this repository into Vercel.
2. Add the environment variables listed above in the Vercel Dashboard.
3. Deploy!

## License

MIT License
