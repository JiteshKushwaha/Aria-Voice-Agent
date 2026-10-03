/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // msedge-tts opens a WebSocket from Node; keep it out of the bundler so its
    // optional native deps are resolved at runtime exactly as on a normal Node server.
    serverExternalPackages: ["msedge-tts"],
    async headers() {
      return [
        {
          source: "/(.*)",
          headers: [
            { key: "Permissions-Policy", value: "microphone=(self)" },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
          ]
        },
        {
          source: "/admin",
          headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]
        }
      ];
    }
  };
  export default nextConfig;