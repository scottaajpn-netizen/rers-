// app/layout.jsx
export const metadata = { title: "RERS - Réseau" };

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
        {children}
      </body>
    </html>
  );
}
