const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const skin of ['client/chat.js', 'client/classic/chat.js']) {
  test(`${skin}: owner/admin update flow is wired and keeps session cache in sync`, () => {
    const source = read(skin);
    assert.match(source, /function handleSaveSessionChanges\(e\)/);
    assert.match(source, /window\.OxypeCore\.updateSession\(activeSessionId, changes, (?:userId, auth \? auth\.token : null|currentUserId\(\), stored \? stored\.token : null)\)/);
    assert.match(source, /const sessionKey = String\(activeSessionId\)/);
    assert.match(source, /sessionsMap\.set\(sessionKey, cached\)/);
    assert.match(source, /renderSessionSettings\(\);[\s\S]*updateActiveSessionHeader\(\);/);
    // The form is exposed only for the role flags returned by getSessionInfo.
    assert.match(source, /(?:const canManage = Boolean\(info\.isOwner \|\| info\.isAdmin\)|openManageBtnEl\.style\.display = \(isOwner \|\| isAdmin\) \? 'inline-flex' : 'none')/);
    assert.match(source, /(?:sessionManageSectionEl\.style\.display = canManage \? 'block' : 'none'|openManageBtnEl\.style\.display = \(isOwner \|\| isAdmin\) \? 'inline-flex' : 'none')/);
  });
}

test('classic skin has the shared edit form and default skin has management entry point', () => {
  const classicHtml = read('client/classic/chat.html');
  const defaultHtml = read('client/chat.html');
  assert.match(classicHtml, /id="sessionManageSection"/);
  assert.match(classicHtml, /id="ssEditForm"/);
  assert.match(classicHtml, /id="ssNameInput"/);
  assert.match(classicHtml, /id="ssDescInput"/);
  assert.match(defaultHtml, /id="openManageBtn"/);
  assert.match(defaultHtml, /id="ssEditForm"/);
});

test('core API sends authenticated name and description fields', () => {
  const source = read('client/core.js');
  assert.match(source, /async updateSession\(sessionId, changes = \{\}, userId = null, token = null\)/);
  assert.match(source, /body\.name = changes\.name/);
  assert.match(source, /body\.description = changes\.description/);
  assert.match(source, /updateSession\/\$\{encodeURIComponent\(sessionId\)\}/);
});
