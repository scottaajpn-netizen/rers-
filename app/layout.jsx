export const metadata = { title: "RERS" };

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#fafafa" }}>
        {children}
      </body>
    </html>
  );
}
