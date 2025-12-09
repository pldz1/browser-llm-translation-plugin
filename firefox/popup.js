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
  const deleteModeButton = document.getElementById("delete-mode-button");
  const translateButton = document.getElementById("start-translate");
  const translateTextarea = document.getElementById("translate-textarea");
  const translateReplace = document.getElementById("replace-text-checkbox");
  const resultSpan = document.getElementById("res-span");
  const notification = document.getElementById("notification");

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
    !deleteModeButton ||
    !translateButton ||
    !translateTextarea ||
    !translateReplace ||
    !resultSpan ||
    !notification
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
  let notificationTimer = null;

  function hideNotification() {
    if (!notification) {
      return;
    }
    notification.classList.add("notification--hidden");
    notification.setAttribute("aria-hidden", "true");
    notificationTimer = null;
  }

  function showNotification(message, type = "info") {
    if (!notification) {
      return;
    }
    if (notificationTimer) {
      clearTimeout(notificationTimer);
      notificationTimer = null;
    }
    notification.textContent = message;
    notification.classList.remove(
      "notification--hidden",
      "notification--info",
      "notification--error"
    );
    notification.classList.add(`notification--${type}`);
    notification.setAttribute("aria-hidden", "false");
    notificationTimer = setTimeout(() => {
      hideNotification();
    }, 3000);
  }

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
      const mergedId = storedConfig.id || defaultConfig.id || id;
      const canDelete = storedConfig.hasOwnProperty("canDelete")
        ? storedConfig.canDelete
        : defaultConfig.hasOwnProperty("canDelete")
        ? defaultConfig.canDelete
        : !defaultPrompts[id];
      if (!storedPrompts[id] && defaultPrompts[id]) {
        changed = true;
      } else if (
        (!storedConfig.label && defaultConfig.label) ||
        (!storedConfig.prompt && defaultConfig.prompt) ||
        (storedConfig.canDelete === undefined &&
          defaultConfig.canDelete !== undefined) ||
        (!storedConfig.id && defaultConfig.id)
      ) {
        changed = true;
      }
      if (!storedConfig.hasOwnProperty("canDelete")) {
        changed = true;
      }
      merged[id] = { label, prompt, id: mergedId, canDelete };
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
    browser.storage.local
      .set({ prompts: promptConfigs, promptOrder: promptOrder })
      .catch((error) => {
        console.error("保存提示词失败：", error);
      });
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
    updateDeleteButtonState(targetId);
  }

  function updateDeleteButtonState(targetId) {
    if (!targetId || !promptConfigs[targetId]) {
      deleteModeButton.disabled = true;
      return;
    }
    deleteModeButton.disabled = !promptConfigs[targetId].canDelete;
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

  // 从浏览器存储读取配置
  browser.storage.local
    .get([
      "endpoint",
      "apikey",
      "target",
      "modelName",
      "replaceText",
      "prompts",
      "promptOrder",
    ])
    .then((result) => {
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
    })
    .catch((error) => {
      console.error("读取存储数据失败：", error);
    });

  // 当 endpoint 输入框内容发生变化时，自动保存到浏览器存储
  endpointInput.addEventListener("change", function () {
    const endpoint = endpointInput.value;
    browser.storage.local
      .set({ endpoint: endpoint })
      .then(() => {
        console.log("Endpoint 更新成功: ", endpoint);
      })
      .catch((error) => {
        console.error("Endpoint 更新失败：", error);
      });
  });

  // 当 API Key 输入框内容发生变化时，自动保存到浏览器存储
  apikeyInput.addEventListener("change", function () {
    const apikey = apikeyInput.value;
    browser.storage.local
      .set({ apikey: apikey })
      .then(() => {
        console.log("API Key 更新成功: ", apikey);
      })
      .catch((error) => {
        console.error("API Key 更新失败：", error);
      });
  });

  // 当模型名称输入框内容发生变化时，自动保存到浏览器存储
  modelNameInput.addEventListener("change", function () {
    const modelName = modelNameInput.value;
    browser.storage.local
      .set({ modelName: modelName })
      .then(() => {
        console.log("modelName 更新成功: ", modelName);
      })
      .catch((error) => {
        console.error("modelName 更新失败：", error);
      });
  });

  // 互译模式有变化时
  targetSelect.addEventListener("change", function () {
    const target = targetSelect.value;
    currentTarget = target && promptConfigs[target] ? target : "";
    browser.storage.local
      .set({ target: target })
      .then(() => {
        console.log("目标更新成功: ", target);
      })
      .catch((error) => {
        console.error("目标更新失败：", error);
      });
    updatePromptArea(currentTarget);
  });

  // 替换操作有变化
  translateReplace.addEventListener("change", function () {
    const replaceText = translateReplace.checked;
    browser.storage.local
      .set({ replaceText: replaceText })
      .then(() => {
        console.log("替换文本操作 更新成功: ", replaceText);
      })
      .catch((error) => {
        console.error("替换文本操作 更新失败：", error);
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
      showNotification("请选择有效的模式!", "error");
      return;
    }
    if (!promptConfigs[currentTarget]) {
      showNotification("模式数据无效, 请删除这个模式!", "error");
      return;
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
      showNotification("请完整填写模式名称和提示词内容。", "error");
      return;
    }

    promptConfigs = {
      ...promptConfigs,
      [id]: {
        label: label,
        id: id,
        canDelete: true,
        prompt: prompt,
      },
    };
    promptOrder = [...promptOrder, id];
    persistPrompts();
    renderTargetOptions(id);
    currentTarget = id;
    targetSelect.value = id;
    browser.storage.local
      .set({ target: id })
      .then(() => {
        console.log("新增模式已设为:", id);
      })
      .catch((error) => {
        console.error("新增模式设为失败：", error);
      });
    updatePromptArea(currentTarget);
    promptLockCheckbox.checked = false;
    promptTextarea.disabled = false;
    promptTextarea.focus();

    newModeLabelInput.value = "";
    newModePromptTextarea.value = "";
  });

  deleteModeButton.addEventListener("click", function () {
    if (
      !currentTarget ||
      !promptConfigs[currentTarget] ||
      !promptConfigs[currentTarget].canDelete
    ) {
      return;
    }

    const removedId = currentTarget;
    const updatedConfigs = { ...promptConfigs };
    delete updatedConfigs[removedId];
    promptConfigs = updatedConfigs;
    promptOrder = promptOrder.filter((id) => id !== removedId);
    persistPrompts();

    const nextTarget = promptOrder.length > 0 ? promptOrder[0] : "";
    currentTarget = nextTarget;
    renderTargetOptions(currentTarget);
    targetSelect.value = currentTarget;
    browser.storage.local
      .set({ target: currentTarget })
      .then(() => {
        console.log("已删除模式:", removedId);
      })
      .catch((error) => {
        console.error("删除模式失败：", error);
      });
    updatePromptArea(currentTarget);
    promptTextarea.disabled = promptLockCheckbox.checked;
  });

  // 点击执行按钮时执行
  translateButton.addEventListener("click", async function () {
    schedulePromptSave(true);
    translateButton.textContent = "...";
    const data = translateTextarea.value;
    const result = await fetchLLM(data);
    resultSpan.textContent = result;
    translateButton.textContent = "翻译";
  });
});
