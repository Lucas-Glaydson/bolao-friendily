/**
 * auth.js – Módulo de autenticação simples (credenciais hardcoded)
 */

// ATENÇÃO: em produção, use autenticação real no servidor.
const CREDENCIAIS = {
  usuario: "admin",
  senha: "bolao2026",
};

const AUTH_KEY = "bolao_auth_v1";

/** Tenta fazer login. Retorna true se credenciais corretas. */
export function login(usuario, senha) {
  if (usuario === CREDENCIAIS.usuario && senha === CREDENCIAIS.senha) {
    localStorage.setItem(AUTH_KEY, "true");
    return true;
  }
  return false;
}

/** Remove a sessão de admin. */
export function logout() {
  localStorage.removeItem(AUTH_KEY);
}

/** Retorna true se o usuário está autenticado como admin. */
export function isAuthenticated() {
  return localStorage.getItem(AUTH_KEY) === "true";
}
