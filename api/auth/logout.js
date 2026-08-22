const { cookieString } = require("./_lib");

module.exports = async function handler(req, res) {
  res.setHeader("Set-Cookie", cookieString("session", "", { maxAge: 0 }));
  res.writeHead(302, { Location: "/api/auth/login" });
  res.end();
};
