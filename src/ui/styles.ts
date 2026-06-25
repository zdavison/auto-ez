/** CSS for the settings UI, injected into the shadow root (isolated from lichess). */
export const PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, sans-serif; }

.abm-ez-button {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483000;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: #3893e8;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.abm-ez-button:hover { background: #2b7fd0; }

.abm-container {
  position: fixed;
  right: 16px;
  bottom: 70px;
  z-index: 2147483000;
  width: 340px;
  max-height: 70vh;
  overflow-y: auto;
  display: none;
  background: #2a2a2a;
  color: #ddd;
  border: 1px solid #444;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  padding: 12px;
}
.abm-container.abm-open { display: block; }

.abm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #444;
}

.abm-field { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
.abm-master-field { font-weight: 700; }

.abm-add {
  background: #3893e8; color: #fff; border: none; border-radius: 4px;
  padding: 4px 10px; cursor: pointer; font-size: 12px;
}
.abm-add:hover { background: #2b7fd0; }

.abm-rule {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 0; border-bottom: 1px solid #383838;
}
.abm-conditions { display: flex; flex-direction: column; gap: 4px; }
.abm-rule select, .abm-rule input[type="text"] {
  background: #1f1f1f; color: #ddd; border: 1px solid #555;
  border-radius: 4px; padding: 2px 4px; font-size: 12px;
}
.abm-message { flex: 1; min-width: 60px; }
.abm-delete {
  background: transparent; color: #c33; border: none;
  cursor: pointer; font-size: 14px; line-height: 1;
}
.abm-delete:hover { color: #f55; }
`;
