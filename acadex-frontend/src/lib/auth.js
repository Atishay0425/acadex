// Demo auth. In production the Express backend issues a JWT after login and
// sets it as an httpOnly cookie; middleware.js then checks the role claim.
export function signIn(role) {
  document.cookie = `acadex_role=${role}; path=/; max-age=86400`
}
export function signOut() {
  document.cookie = 'acadex_role=; path=/; max-age=0'
}
