browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: "llm_translate_contextmenu",
    title: "翻译选中的文本(LLM Translation)",
    contexts: ["selection"],
  });
});

// 右键菜单点击
browser.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "llm_translate_contextmenu") {
    await translateText();
  }
});

// 快捷键监听
browser.commands.onCommand.addListener(async (command) => {
  if (command === "llm_translate_shortcut") {
    await translateText();
  }
});

// 执行翻译
async function translateText() {
  let [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    try {
      // 显示加载动画
      await browser.tabs.executeScript(tab.id, {
        code: `(${showLoadingIndicator.toString()})()`,
      });

      // 获取选中的文本
      const results = await browser.tabs.executeScript(tab.id, {
        code: `(${getSelectedText.toString()})()`,
      });

      if (results && results[0]) {
        const selectedText = results[0];
        const translatedText = await fetchLLM(selectedText);
        if (!translatedText) return;

        // 获取是否需要替换原文本
        const { replaceText = false } = await getStorageData(["replaceText"]);

        // 处理翻译文本
        await browser.tabs.executeScript(tab.id, {
          code: `(${processTranslation.toString()})(${JSON.stringify(
            translatedText
          )}, ${replaceText})`,
        });
      }
    } catch (error) {
      console.error("执行失败：", error);
    } finally {
      // 移除加载动画
      await browser.tabs.executeScript(tab.id, {
        code: `(${removeLoader.toString()})()`,
      });
    }
  }
}

// 选中区域旁边显示加载动画
function showLoadingIndicator() {
  const style = document.createElement("style");
  style.id = "temporary-selection-style";
  style.textContent = `
    ::selection {
      background: yellow !important;
    }
  `;
  document.head.appendChild(style);
}

// 移除加载动画
function removeLoader() {
  const styleTag = document.getElementById("temporary-selection-style");
  if (styleTag) {
    styleTag.remove();
  }
}

// 获取选中的文本
function getSelectedText() {
  const activeElement = document.activeElement;
  if (
    activeElement &&
    (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")
  ) {
    return activeElement.value.substring(
      activeElement.selectionStart,
      activeElement.selectionEnd
    );
  } else {
    return window.getSelection().toString();
  }
}

// 处理翻译文本
function processTranslation(translation, replaceFlag) {
  if (replaceFlag) {
    if (!translation) return;
    const activeElement = document.activeElement;

    if (
      activeElement &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA")
    ) {
      activeElement.focus();
      const start = activeElement.selectionStart;
      const end = activeElement.selectionEnd;
      const value = activeElement.value;

      activeElement.value =
        value.substring(0, start) + translation + value.substring(end);
      activeElement.setSelectionRange(start, start + translation.length);
    } else {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(translation));
      }
    }
  } else {
    // 移除已有翻译窗口
    const existingDiv = document.getElementById("llm_translate_div");
    if (existingDiv) {
      existingDiv.remove();
    }

    // 显示翻译结果
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const div = document.createElement("div");
      div.id = "llm_translate_div";
      div.textContent = translation;

      // 添加关闭按钮
      const closeButton = document.createElement("button");
      closeButton.innerHTML = `<svg width="16px" height="16px" viewBox="0 0 0.32 0.32" xmlns="http://www.w3.org/2000/svg"><path fill="#000000" fill-rule="evenodd" d="M0.226 0.066a0.02 0.02 0 1 1 0.028 0.028L0.188 0.16l0.066 0.066a0.02 0.02 0 0 1 -0.028 0.028L0.16 0.188l-0.066 0.066a0.02 0.02 0 0 1 -0.028 -0.028L0.132 0.16 0.066 0.094a0.02 0.02 0 0 1 0.028 -0.028L0.16 0.132z"/></svg>`;
      closeButton.style.cssText = `
          position: absolute;
          top: 4px;
          right: 4px;
          cursor: pointer;
          border: none;
          font-size: 12px;
          font-weight: bold;`;
      closeButton.addEventListener("click", () => {
        div.remove();
      });

      // 添加拷贝按钮
      const copyButton = document.createElement("button");
      copyButton.innerHTML = `<svg width="16px" height="16px" viewBox="0 0 0.32 0.32" xmlns="http://www.w3.org/2000/svg" fill="#000000"><path fill-rule="evenodd" clip-rule="evenodd" d="M0.08 0.08 0.1 0.06h0.108L0.28 0.132V0.28L0.26 0.3h-0.16L0.08 0.28zm0.18 0.06L0.2 0.08H0.1v0.2h0.16z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M0.06 0.02 0.04 0.04v0.2l0.02 0.02V0.04h0.128L0.168 0.02z"/></svg>`;
      copyButton.style.cssText = `
          position: absolute;
          top: 4px;
          right: 32px;
          cursor: pointer;
          border: none;
          font-size: 12px;
          font-weight: bold;`;

      copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(translation);
          copyButton.innerHTML = `<svg version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 16 16" style="enable-background:new 0 0 240.608 240.608;" xml:space="preserve" width="16" height="16"><path style="fill:#020202;" d="m13.884 1.993 2.116 2.116L6.102 14.007 0 7.905l2.116 -2.116 3.986 3.986z"/></svg>`;
          setInterval(() => {
            copyButton.innerHTML = `<svg width="16px" height="16px" viewBox="0 0 0.32 0.32" xmlns="http://www.w3.org/2000/svg" fill="#000000"><path fill-rule="evenodd" clip-rule="evenodd" d="M0.08 0.08 0.1 0.06h0.108L0.28 0.132V0.28L0.26 0.3h-0.16L0.08 0.28zm0.18 0.06L0.2 0.08H0.1v0.2h0.16z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M0.06 0.02 0.04 0.04v0.2l0.02 0.02V0.04h0.128L0.168 0.02z"/></svg>`;
          }, 3000);
        } catch (err) {
          console.error("复制失败", err);
        }
      });

      div.style.cssText = `
          position: absolute;
          background-color: #ffffff;
          border: 1px solid #00000040;
          padding: 25px 5px 5px 5px;
          box-sizing: border-box;
          max-width: 400px;
          min-width: 64px;
          z-index: 10000000001;
      `;

      // ✅ 保留换行显示（最后加）
      div.style.whiteSpace = "pre-wrap";
      div.style.wordBreak = "break-word";

      div.appendChild(closeButton);
      div.appendChild(copyButton);

      // 设置 div 的位置
      div.style.top = rect.bottom + window.scrollY + "px";
      div.style.left = rect.left + window.scrollX + "px";

      document.body.appendChild(div);
    }
  }
}
