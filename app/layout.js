import "./globals.css";

export const metadata = {
  title: "HubSpot CSV CRM Sync",
  description: "Dynamic CSV mapping for HubSpot contacts, companies, deals, and associations on Vercel.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
