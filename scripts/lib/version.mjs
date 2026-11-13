// Version rules: package.json holds semver (x.y.z); the manifest holds the 4-part Elgato form (x.y.z.0);
// release tags are <plugin>-v<semver>. Returns a list of problems (empty = consistent).

const SEMVER = /^\d+\.\d+\.\d+$/;

export function versionProblems({ plugin, pkgVersion, manifestVersion, tag }) {
  const problems = [];
  if (!SEMVER.test(pkgVersion)) problems.push(`${plugin}: package.json version "${pkgVersion}" is not x.y.z`);
  if (manifestVersion !== `${pkgVersion}.0`) {
    problems.push(`${plugin}: manifest Version "${manifestVersion}" must be "${pkgVersion}.0" (package.json is ${pkgVersion})`);
  }
  if (tag !== undefined && tag !== `${plugin}-v${pkgVersion}`) {
    problems.push(`${plugin}: tag "${tag}" must be "${plugin}-v${pkgVersion}"`);
  }
  return problems;
}
