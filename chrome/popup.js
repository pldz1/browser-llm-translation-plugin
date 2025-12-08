document.addEventListener("DOMContentLoaded", function () {
  // 尝试获取所有需要的 DOM 元素
  const endpointInput = document.getElementById("endpoint-input");
  const apikeyInput = document.getElementById("apikey-input");
  const modelNameInput = document.getElementById("modelname-input");
  const targetSelect = document.getElementById("target-language-select");
  const promptTextarea = document.getElementById("prompt-textarea");
  const promptLockCheckbox = document.getElementById("lock-prompt-checkbox");
  const addModeButton = document.getElementById("add-mode-button");
  const newModeLabelInput = document.getElementById("new-mode-label-input");
  const newModePromptTextarea = document.getElementById(
    "new-mode-prompt-textarea"
  );
  const translateButton = document.getElementById("start-translate");
  const translateTextarea = document.getElementById("translate-textarea");
  const translateReplace = document.getElementById("replace-text-checkbox");
  const resultSpan = document.getElementById("res-span");

  // 检查是否所有关键元素都存在
  if (
    !endpointInput ||
    !apikeyInput ||
    !modelNameInput ||
    !targetSelect ||
    !promptTextarea ||
    !promptLockCheckbox ||
    !addModeButton ||
    !newModeLabelInput ||
    !newModePromptTextarea ||
    !translateButton ||
    !translateTextarea ||
    !translateReplace ||
    !resultSpan
  ) {
    console.error("部分必要的 DOM 元素不存在，请检查 popup.html 文件的结构。");
    // 终止后续执行，避免 null 引起错误
    return;
  }

  const defaultPrompts = window.DEFAULT_PROMPTS || {};
  let promptConfigs = {};
  let promptOrder = [];
  let currentTarget = "";
  let promptSaveTimer = null;

  function mergePrompts(storedPrompts = {}) {
    const merged = {};
    let changed = false;
    const keys = new Set([
      ...Object.keys(defaultPrompts),
      ...Object.keys(storedPrompts || {}),
    ]);
    keys.forEach((id) => {
      const defaultConfig = defaultPrompts[id] || {};
      const storedConfig = storedPrompts[id] || {};
      const label = storedConfig.label || defaultConfig.label || id;
      const prompt = storedConfig.prompt || defaultConfig.prompt || "";
      if (!storedPrompts[id] && defaultPrompts[id]) {
        changed = true;
      } else if (
        (!storedConfig.label && defaultConfig.label) ||
        (!storedConfig.prompt && defaultConfig.prompt)
      ) {
        changed = true;
      }
      merged[id] = { label, prompt };
    });
    return { merged, changed };
  }

  function buildOrder(storedOrder = [], promptsMap) {
    const order = [];
    (storedOrder || []).forEach((id) => {
      if (promptsMap[id] && !order.includes(id)) {
        order.push(id);
      }
    });
    Object.keys(defaultPrompts).forEach((id) => {
      if (promptsMap[id] && !order.includes(id)) {
        order.push(id);
      }
    });
    Object.keys(promptsMap).forEach((id) => {
      if (!order.includes(id)) {
        order.push(id);
      }
    });
    return order;
  }

  function persistPrompts() {
    chrome.storage.local.set(
      { prompts: promptConfigs, promptOrder: promptOrder },
      function () {
        if (chrome.runtime.lastError) {
          console.error("保存提示词失败：", chrome.runtime.lastError);
        }
      }
    );
  }

  function renderTargetOptions(selectedValue) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "请选择";
    const fragment = document.createDocumentFragment();
    fragment.appendChild(placeholder);
    promptOrder.forEach((id) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = promptConfigs[id]?.label || id;
      fragment.appendChild(option);
    });
    targetSelect.innerHTML = "";
    targetSelect.appendChild(fragment);
    if (selectedValue && promptConfigs[selectedValue]) {
      targetSelect.value = selectedValue;
    }
  }

  function updatePromptArea(targetId) {
    if (targetId && promptConfigs[targetId]) {
      promptTextarea.value = promptConfigs[targetId].prompt || "";
    } else {
      promptTextarea.value = "";
    }
  }

  function schedulePromptSave(immediate = false) {
    if (!currentTarget || !promptConfigs[currentTarget]) {
      return;
    }
    if (promptSaveTimer) {
      clearTimeout(promptSaveTimer);
      promptSaveTimer = null;
    }
    const save = () => {
      promptConfigs[currentTarget].prompt = promptTextarea.value;
      persistPrompts();
    };
    if (immediate) {
      save();
    } else {
      promptSaveTimer = setTimeout(save, 400);
    }
  }

  // 从 chrome 存储中读取保存的数据，并填充到对应输入框
  chrome.storage.local.get(
    [
      "endpoint",
      "apikey",
      "target",
      "modelName",
      "replaceText",
      "prompts",
      "promptOrder",
    ],
    function (result) {
      const storedOrder = Array.isArray(result.promptOrder)
        ? result.promptOrder
        : [];
      const mergeResult = mergePrompts(result.prompts || {});
      promptConfigs = mergeResult.merged;
      promptOrder = buildOrder(storedOrder, promptConfigs);
      const orderChanged =
        storedOrder.length !== promptOrder.length ||
        storedOrder.some((id, index) => id !== promptOrder[index]);
      if (mergeResult.changed || orderChanged) {
        persistPrompts();
      }

      if (result.endpoint) {
        endpointInput.value = result.endpoint;
      }
      if (result.apikey) {
        apikeyInput.value = result.apikey;
      }
      if (result.modelName) {
        modelNameInput.value = result.modelName;
      }
      currentTarget =
        result.target && promptConfigs[result.target] ? result.target : "";
      renderTargetOptions(currentTarget);
      if (result.target) {
        targetSelect.value = result.target;
      }
      if (result.replaceText) {
        translateReplace.checked = result.replaceText;
      }
      updatePromptArea(currentTarget);
      promptTextarea.disabled = promptLockCheckbox.checked;
    }
  );

  // 当 endpoint 输入框内容发生变化时，自动保存到 chrome 存储
  endpointInput.addEventListener("change", function () {
    const endpoint = endpointInput.value;
    chrome.storage.local.set({ endpoint: endpoint }, function () {
      console.log("Endpoint 更新成功: ", endpoint);
    });
  });

  // 当 API Key 输入框内容发生变化时，自动保存到 chrome 存储
  apikeyInput.addEventListener("change", function () {
    const apikey = apikeyInput.value;
    chrome.storage.local.set({ apikey: apikey }, function () {
      console.log("API Key 更新成功: ", apikey);
    });
  });

  // 当 模型名字的 输入框内容发生变化时，自动保存到 chrome 存储
  modelNameInput.addEventListener("change", function () {
    const modelName = modelNameInput.value;
    chrome.storage.local.set({ modelName: modelName }, function () {
      console.log("modelName 更新成功: ", modelName);
    });
  });

  // 语言有变化时
  targetSelect.addEventListener("change", function () {
    const target = targetSelect.value;
    currentTarget = target && promptConfigs[target] ? target : "";
    chrome.storage.local.set({ target: target }, function () {
      console.log("目标语言更新成功: ", target);
    });
    updatePromptArea(currentTarget);
  });

  // 替换操作有变化
  translateReplace.addEventListener("change", function () {
    const replaceText = translateReplace.checked;
    chrome.storage.local.set({ replaceText: replaceText }, function () {
      console.log("替换文本操作 更新成功: ", replaceText);
    });
  });

  promptLockCheckbox.addEventListener("change", function () {
    const isLocked = promptLockCheckbox.checked;
    promptTextarea.disabled = isLocked;
    if (!isLocked) {
      promptTextarea.focus();
    } else {
      schedulePromptSave(true);
    }
  });

  promptTextarea.addEventListener("input", function () {
    if (!currentTarget || promptLockCheckbox.checked) {
      return;
    }
    if (!promptConfigs[currentTarget]) {
      promptConfigs[currentTarget] = {
        label: currentTarget,
        prompt: "",
      };
    }
    promptConfigs[currentTarget].prompt = promptTextarea.value;
    schedulePromptSave(false);
  });

  promptTextarea.addEventListener("blur", function () {
    if (!currentTarget || promptLockCheckbox.checked) {
      return;
    }
    schedulePromptSave(true);
  });

  addModeButton.addEventListener("click", function () {
    const label = newModeLabelInput.value.trim();
    let id = generateAlphaNumericId();
    const prompt = newModePromptTextarea.value.trim();

    if (!label || !prompt) {
      alert("请完整填写模式名称和提示词内容。");
      return;
    }

    promptConfigs = {
      ...promptConfigs,
      [id]: {
        label: label,
        prompt: prompt,
      },
    };
    promptOrder = [...promptOrder, id];
    persistPrompts();
    renderTargetOptions(id);
    currentTarget = id;
    targetSelect.value = id;
    chrome.storage.local.set({ target: id }, function () {
      console.log("新增模式已设为当前互译模式:", id);
    });
    updatePromptArea(currentTarget);
    promptLockCheckbox.checked = false;
    promptTextarea.disabled = false;
    promptTextarea.focus();

    newModeLabelInput.value = "";
    newModePromptTextarea.value = "";
  });

  // 点击翻译按钮时执行
  translateButton.addEventListener("click", async function () {
    schedulePromptSave(true);
    translateButton.textContent = "...";
    //将返回结果展示到页面上
    const data = translateTextarea.value;
    const result = await fetchLLM(data);
    resultSpan.textContent = result;
    translateButton.textContent = "翻译";
  });
});
