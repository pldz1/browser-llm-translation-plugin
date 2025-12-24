// 默认提示词配置
const DEFAULT_PROMPTS = {
  cn_en_translation: {
    label: "中英互译",
    id: "cn_en_translation",
    canDelete: false,
    prompt:
      "你是一名顶级的专业翻译家，擅长精准、地道地进行中英互译。请将下面内容翻译成另一种语言。在翻译过程中，严格保持原文的含义、语气和风格，**仅输出翻译结果，无需添加任何解释或评论**：\n\n{{text}}",
  },
  editing_assistant: {
    label: "中英润色",
    id: "editing_assistant",
    canDelete: false,
    prompt:
      "你是一位专业的文档编辑专家，请根据原文语言，将其润色为**专业、严谨且流畅的官方文档或正式商业文本风格**。在润色时，务必保持原文的核心事实和技术术语不变。**请先输出润色后的内容；随后在新的段落，以一个简洁的列表说明主要的修改点和改进之处**：\n\n{{text}}",
  },
};

// 将默认配置暴露给其他脚本使用
if (typeof window !== "undefined") {
  window.DEFAULT_PROMPTS = DEFAULT_PROMPTS;
}

// 获取存储数据
function getStorageData(keys) {
  return new Promise((resolve, reject) => {
    browser.storage.local.get(keys, function (result) {
      if (browser.runtime.lastError) {
        reject(browser.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

// 生成具体提问的内容
function getUserContent(target, data, prompts = {}) {
  const template =
    (prompts[target] && prompts[target].prompt) ||
    (DEFAULT_PROMPTS[target] && DEFAULT_PROMPTS[target].prompt) ||
    "";

  if (!template) {
    return data || "";
  }

  const placeholderPattern = /\{\{\s*text\s*\}\}/gi;
  if (placeholderPattern.test(template)) {
    return template.replace(placeholderPattern, data);
  }

  return `${template}\n\n${data}`;
}

// 发送请求到 LLM 进行翻译
async function fetchLLM(data) {
  try {
    const {
      endpoint = "",
      apikey = "",
      target = "",
      modelName = "",
      prompts = {},
    } = await getStorageData([
      "endpoint",
      "apikey",
      "target",
      "modelName",
      "prompts",
    ]);

    if (!endpoint || !apikey || !target) {
      return "关键参数没有设置完全";
    }

    const contentText = getUserContent(target, data, prompts);
    if (!contentText) {
      return "尚未为该模式配置提示词";
    }

    const validEndpoint = endpoint.includes("{{modelName}}")
      ? endpoint.replace("{{modelName}}", modelName)
      : endpoint;

    const response = await fetch(validEndpoint, {
      headers: {
        Accept: "application/json",
        "api-key": `${apikey}`,
        "Content-Type": "application/json",
        authorization: `Bearer ${apikey}`,
      },
      body: JSON.stringify({
        ...(modelName && { model: modelName }),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: contentText,
              },
            ],
          },
        ],
      }),
      method: "POST",
      mode: "cors",
      credentials: "omit",
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const result = await response.json();
    return result.choices[0].message.content || "翻译失败";
  } catch (error) {
    console.error("获取存储数据出错：", error);
    return "获取存储数据出错";
  }
}

function generateAlphaNumericId() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(16).substring(2, 6);
  return `${timestamp}-${randomPart}`;
}
