# 🚀 Tari Minotari Base Node Monitor

Система непрерывного мониторинга и телеметрии для блокчейн-ноды **Minotari Base Node** (проект [Tari](https://github.com/tari-project/tari)).

---

## 📌 Архитектура и стек технологий

- **Язык**: Python 3.12 (с использованием `asyncio` для неблокирующих фоновых опросов)
- **Транспорт**: `grpcio` + `protobuf` (прямое взаимодействие со службой `tari.rpc.BaseNode`)
- **Веб-фреймворк**: FastAPI + Uvicorn + Jinja2 (высокая производительность, встроенный REST API, Swagger UI `/docs`, мгновенный рендеринг)
- **Проверка релизов**: Интеграция с GitHub REST API (`httpx`) с разбором SemVer и кэшированием
- **Развертывание**: Docker + Docker Compose (`python:3.12-slim`, автоматическая компиляция protobuf-схем на этапе сборки)

---

## 🗂 Структура проекта

```text
.
├── .env                        # Файл переменных окружения с настройками
├── .env.example                # Шаблон конфигурации для развертывания
├── docker-compose.yml          # Манифест Docker Compose
├── Dockerfile                  # Многоэтапный Dockerfile для сборки сервиса
├── requirements.txt            # Зависимости Python
├── protos/
│   └── base_node.proto         # Protobuf-описание сервиса tari.rpc.BaseNode
├── app/
│   ├── main.py                 # FastAPI приложение, фоновый воркер и роутинг
│   ├── tari_grpc.py            # gRPC-клиент с обработкой ошибок и таймаутами
│   ├── github_checker.py       # Парсер релизов GitHub API и проверка обновлений
│   └── templates/
│       └── index.html          # Легковесный дашборд (Tailwind CSS, автообновление)
└── README.md                   # Руководство по запуску и эксплуатации
```

---

## ⚙️ Конфигурация (.env)

| Переменная | По умолчанию | Описание |
|---|---|---|
| `TARI_NODE_GRPC_HOST` | `127.0.0.1` | IP или хост gRPC-сервера `minotari_node` (для Docker используйте `host.docker.internal` если нода на хосте) |
| `TARI_NODE_GRPC_PORT` | `18145` | Порт gRPC (`18145` = Esmeralda Testnet, `18142` = Mainnet, `18188` = Nextnet) |
| `POLL_INTERVAL_SECONDS`| `15` | Частота опроса ноды в секундах (10–30 сек) |
| `WEB_PORT` | `8000` | Внешний веб-порт дашборда |
| `GITHUB_REPO` | `tari-project/tari` | Официальный репозиторий для проверки обновлений |
| `TARI_NODE_TLS` | `false` | Использование TLS/SSL для gRPC-соединения |
| `TARI_CA_CERT_PATH` | `""` | Путь к CA-сертификату (если TLS включен) |
| `LOG_LEVEL` | `INFO` | Уровень логирования (`DEBUG`, `INFO`, `WARN`, `ERROR`) |

---

## 📦 Вариант А: Запуск готового образа из GitHub Container Registry (без локальной сборки)

Если вы опубликовали репозиторий на GitHub, настроенный GitHub Actions workflow (`.github/workflows/docker-publish.yml`) **автоматически соберет и опубликует образ** в `ghcr.io`. 

На целевом сервере вам **не нужно иметь git, исходники, python или gcc**. Достаточно скачать готовый compose-файл:

```bash
# 1. Скачать готовый манифест и пример конфига
curl -O https://raw.githubusercontent.com/<YOUR_USER>/<YOUR_REPO>/main/docker-compose.prod.yml
curl -O https://raw.githubusercontent.com/<YOUR_USER>/<YOUR_REPO>/main/.env.example
cp .env.example .env

# 2. Запустить одной командой (скачает готовый образ из реестра за пару секунд)
docker compose -f docker-compose.prod.yml up -d

# 3. Обновление до свежей версии в любой момент
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
```

---

## 🛠 Вариант Б: Локальная сборка из исходников (Docker Compose)

### 1. Клонирование и настройка окружения
```bash
cp .env.example .env
# Отредактируйте .env при необходимости (например, укажите IP вашей ноды):
nano .env
```

> **Важно**: Если `minotari_node` запущена локально на том же сервере вне Docker, установите в `.env`:
> ```env
> TARI_NODE_GRPC_HOST=host.docker.internal
> ```
> Директива `extra_hosts` в `docker-compose.yml` автоматически маршрутизирует трафик к локальному интерфейсу хоста.

### 2. Запуск контейнера
```bash
docker compose up -d --build
```

### 3. Просмотр логов в реальном времени
```bash
docker compose logs -f minotari-monitor
```

### 4. Доступ к дашборду
Откройте браузер по адресу: **http://localhost:8000** (или `http://<IP_СЕРВЕРА>:8000`).

---

## 🛰 Реализованные gRPC-методы Tari BaseNode

1. **`GetVersion`** — получение версии запущенной ноды и сопоставление с последним релизом на GitHub.
2. **`Identify`** — идентификатор ноды (`node_id`), публичный ключ (`public_key`) и анонсированные сетевые адреса.
3. **`GetNetworkStatus`** — статус сети (P2P Status: `ONLINE`, `LISTENING`, `DEGRADED`, `OFFLINE`), средняя задержка (`avg_latency_ms`) и количество соединений.
4. **`GetTipInfo`** — высота цепи (`height`), хэш последнего блока (`best_block_hash`), накопленная сложность (`accumulated_difficulty`) и статус синхронизации (`is_synced`).
5. **`GetSyncProgress`** — фаза синхронизации (`STARTING`, `HEADER_SYNC`, `BLOCK_SYNC`, `SYNCED`) и локальная высота относительно вершины сети.
6. **`GetNewBlockTemplate`** — готовность ноды к майнингу, высота следующего блока, награда в MicroTari/XTM и сложность.
7. **`GetMempoolStats`** — количество транзакций в мемпуле (`unconfirmed_txs`) и суммарный вес.
8. **`GetActiveSyncPeers`** — список активных пиров синхронизации с задержками и версиями клиентов.

---

## 🛡 Безопасность и TLS

По умолчанию локальное соединение gRPC работает по незащищенному протоколу (insecure channel), что является стандартом для локального взаимодействия демонов на одном хосте.

Если ваш `minotari_node` требует TLS:
1. Поместите сертификат в каталог проекта (например, `certs/tari-ca.crt`).
2. В файле `.env` укажите:
   ```env
   TARI_NODE_TLS=true
   TARI_CA_CERT_PATH=/app/certs/tari-ca.crt
   ```
3. Смонтируйте каталог с сертификатом в `docker-compose.yml` в секции `volumes`.
