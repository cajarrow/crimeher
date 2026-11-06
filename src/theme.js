// Category colors, shared by the site and the desk.
// base (dots, rules, bars), tint (pill background), ink (text on the tint, >= 4.6:1).
export const KCOLORS = {
  breaking: ['#C62828', '#F8E5E5', '#C62828'], missing: ['#E8890C', '#FCF1E2', '#8B5207'],
  alerts: ['#00897B', '#E0F1EF', '#006E62'], safety: ['#7B2CBF', '#EFE6F7', '#7B2CBF'],
  courtroom: ['#9C6B00', '#F3EDE0', '#8C6000'], cold: ['#1E6FD9', '#E4EEFA', '#1B64C3'],
  truecrime: ['#E0407A', '#FBE8EF', '#B33362'], watch: ['#2E7D32', '#E6EFE6', '#29702D']
};
export const KCSS = Object.entries(KCOLORS).map(([k, [b, t, i]]) => `.k-${k}{--k:${b};--kt:${t};--ki:${i}}`).join('');
