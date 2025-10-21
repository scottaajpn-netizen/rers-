// app/layout.jsx
import "./globals.css";

export const metadata = {
  title: "RERS",
  description: "Annuaire — échanges de savoirs",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
