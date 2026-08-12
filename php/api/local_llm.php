<?php
/**
 * Local LLM Proxy
 * Proxies chat requests to a local LLM server (Ollama, LM Studio, llama.cpp)
 * Supports streaming responses and model listing.
 */

function getLocalLLMConfig() {
    $baseUrl = getenv('LOCAL_LLM_BASE_URL') ?: 'http://localhost:11434';
    $apiKey = getenv('LOCAL_LLM_API_KEY') ?: '';
    return ['base_url' => rtrim($baseUrl, '/'), 'api_key' => $apiKey];
}

function proxyRequest($path, $method, $body = null, $headers = []) {
    $config = getLocalLLMConfig();
    $url = $config['base_url'] . $path;

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

    $reqHeaders = ['Content-Type: application/json'];
    if (!empty($config['api_key'])) {
        $reqHeaders[] = 'Authorization: Bearer ' . $config['api_key'];
    }
    foreach ($headers as $key => $value) {
        $reqHeaders[] = $key . ': ' . $value;
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $reqHeaders);

    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return [$httpCode, $response];
}

function streamChatResponse($path, $body, $headers = []) {
    $config = getLocalLLMConfig();
    $url = $config['base_url'] . $path;

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $chunk) {
        echo $chunk;
        ob_flush();
        flush();
        return strlen($chunk);
    });
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');

    $reqHeaders = ['Content-Type: application/json', 'Accept: text/event-stream'];
    if (!empty($config['api_key'])) {
        $reqHeaders[] = 'Authorization: Bearer ' . $config['api_key'];
    }
    foreach ($headers as $key => $value) {
        $reqHeaders[] = $key . ': ' . $value;
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $reqHeaders);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    curl_setopt($ch, CURLOPT_TIMEOUT, 120);

    curl_exec($ch);
    curl_close($ch);
}

function handleLocalLLM($action, $propertyId) {
    header('Content-Type: application/json');

    if ($action === 'list_local_llm_models') {
        [$code, $response] = proxyRequest('/api/tags', 'GET');
        http_response_code($code);
        echo $response;
        return;
    }

    if ($action === 'local_llm_chat') {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $model = $input['model'] ?? '';
        $messages = $input['messages'] ?? [];
        $stream = $input['stream'] ?? false;

        if (empty($model) || empty($messages)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'model and messages are required']);
            return;
        }

        // Build system prompt with property context
        $systemPrompt = "You are a helpful assistant for a resort management system. ";
        if ($propertyId) {
            $systemPrompt .= "You are assisting with property ID $propertyId. ";
        }
        $systemPrompt .= "Provide concise, helpful responses. If you need to perform actions, describe what you would do.";

        $chatBody = [
            'model' => $model,
            'messages' => array_merge([['role' => 'system', 'content' => $systemPrompt]], $messages),
            'stream' => $stream,
        ];

        if ($stream) {
            header('Content-Type: text/event-stream');
            header('Cache-Control: no-cache');
            header('X-Accel-Buffering: no');
            streamChatResponse('/api/chat', $chatBody);
            return;
        }

        [$code, $response] = proxyRequest('/api/chat', 'POST', $chatBody);
        http_response_code($code);
        echo $response;
        return;
    }

    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid action']);
}
