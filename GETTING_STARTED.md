# Getting Started with ycode

This guide will walk you through setting up and running `ycode` on your local machine.

## Prerequisites

1.  **Node.js**: Version 18 or higher.
2.  **Ollama**: Required for running local models (e.g., Qwen2.5-coder).
    -   Download from [ollama.com](https://ollama.com).
3.  **Git**: For cloning the repository.

---

## 1. Setup Local LLM (Ollama)

`ycode` is designed to work with local models via Ollama. 

1.  **Start Ollama**: Ensure the Ollama server is running on your machine.
2.  **Pull the recommended model**:
    ```bash
    ollama pull qwen2.5-coder:1.5b
    ```
    *(Note: You can use larger models like `7b` if your hardware supports it by updating the `.env` file later.)*

---

## 2. Installation

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd ycode
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment**:
    Create a `.env` file in the root directory:
    ```bash
    cp .env.example .env
    ```
    The default settings in `.env` are pre-configured to work with a local Ollama instance:
    ```env
    API_BASE_URL=http://localhost:11434/v1
    API_KEY=ollama
    MODEL_NAME=qwen2.5-coder:1.5b
    ```

---

## 3. Building the Project

`ycode` uses TypeScript and React (Ink) for its rich CLI interface. You must build the project before running it:

```bash
npm run build
```

---

## 4. Running ycode

There are two ways to start the application:

### Interactive Chat Mode
Starts a fresh session where you can talk to the agent:
```bash
npm start
```

### Direct Prompt
Start a session with an initial instruction:
```bash
node dist/index.js chat "List the files in the current directory"
```

---

## 5. Using the Interface

-   **Natural Language**: Speak to `ycode` like you would to any AI.
-   **Tool Permissions**: When `ycode` needs to perform an action (like writing a file or running a shell command), it will show a **Yellow Permission Box**. 
    -   Type `y` to allow.
    -   Type `n` to deny.
-   **Exiting**: Type `exit` in the prompt to close the application.

---

## Troubleshooting

-   **Model not found**: Ensure you have run `ollama pull <model_name>` for the model specified in your `.env`.
-   **Connection Error**: Check if Ollama is running (`curl http://localhost:11434`).
-   **UI Rendering Issues**: Ensure your terminal supports Unicode and ANSI colors (most modern terminals like VS Code, iTerm2, and Windows Terminal do).
