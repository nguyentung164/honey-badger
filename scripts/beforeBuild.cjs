/**
 * electron-builder beforeBuild hook.
 * Windows: skip native rebuild — node-pty uses N-API prebuilds (no Visual Studio required).
 * Other platforms: allow default rebuild.
 *
 * @param {import('electron-builder').BeforeBuildContext} context
 * @returns {Promise<boolean | void>}
 */
exports.default = async function beforeBuild(context) {
  const platform = context.platform?.nodeName ?? process.platform
  if (platform === 'win32') {
    console.log('[beforeBuild] Windows — skip native rebuild (node-pty prebuilds)')
    return false
  }
}
