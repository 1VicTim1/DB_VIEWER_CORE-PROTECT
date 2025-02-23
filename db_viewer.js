const sqlite3 = require('sqlite3').verbose();
const readlineSync = require('readline-sync'); // Для взаимодействия с пользователем
const fs = require('fs'); // Для работы с файлами
const path = require('path'); // Для работы с путями файлов
const https = require('https'); // Для загрузки файлов по HTTPS
const request = require('request');

// Версия скрипта
const CURRENT_VERSION = '2.3alpha';

// Путь к конфигурационному файлу
const configPath = path.join(__dirname, 'config.json');

// Путь к скрипту
const scriptPath = path.join(__dirname, 'db_viewer.js');

// Адрес репозитория на GitHub
const UPDATE_URL = 'https://raw.githubusercontent.com/1VicTim1/DB_VIEWER_CORE-PROTECT/main/db_viewer.js';

// Функция для проверки обновлений
function checkForUpdates() {
    request(UPDATE_URL, (error, response, body) => {
        if (!error && response.statusCode === 200) {
            const updatedScript = body.toString();
            let currentScript;

            try {
                currentScript = fs.readFileSync(scriptPath, 'utf8');
            } catch (err) {
                console.error('Не удалось прочитать текущий скрипт:', err);
                return;
            }

            if (updatedScript !== currentScript) {
                console.log('Обнаружено обновление скрипта. Начинаю обновление...');
                
                try {
                    fs.writeFileSync(scriptPath, updatedScript, 'utf8');
                    console.log('Скрипт успешно обновлён.');
                } catch (err) {
                    console.error('Ошибка при обновлении скрипта:', err);
                }
            } else {
                console.log('Ваш скрипт уже обновлен до последней версии.');
            }
        } else {
            console.error('Ошибка при проверке обновлений:', error);
        }
    });
}

// Основная логика программы
(async () => {
    // Проверяем обновления перед запуском основного функционала
    checkForUpdates();

    // Определение dbPath
    let dbPath;
    if (!fs.existsSync(configPath)) {
        // Если файл не существует, запрашиваем путь к базе данных
        dbPath = readlineSync.question('Укажите путь к базе данных (.db): ');
        const dbDir = path.dirname(dbPath);

        // Проверяем существование указанной папки
        if (!fs.existsSync(dbDir)) {
            console.error(`Указанная директория "${dbDir}" не существует.`);
            process.exit(1);
        }

        // Сохраняем путь в конфигурационный файл
        fs.writeFileSync(configPath, JSON.stringify({ dbPath }), 'utf8');
        console.log('Конфигурация сохранена.');
    } else {
        // Читаем путь из конфигурационного файла
        const configData = fs.readFileSync(configPath, 'utf8');
        dbPath = JSON.parse(configData).dbPath;
    }

    // Подключение к базе данных
    let db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, async (err) => {
        if (err) {
            console.error(err.message);
            return;
        }
        console.log('Connected to the database');

        // Обработка аргументов
        let userArguments = process.argv.slice(2); // Получаем аргументы командной строки
        mainFunction(userArguments, db); // Передаем db в основную функцию

        // Функция для вызова основной логики с аргументами
        async function mainFunction(arguments, db) {
            let teleportArgs = null;   // Инициализация переменной для телепортации
            let radiusFilter = null;   // Инициализация радиуса фильтра
            let filterType = null;     // Инициализация типа фильтра
            let filterValue = null;    // Инициализация значения фильтра
            let actionFilter = null;   // Инициализация фильтра действий
        
            for (let i = 0; i < arguments.length; i++) {
                if (arguments[i] === '--help') {
                    showHelp();         // Показываем помощь и прерываем выполнение
                    return;
                } else if (arguments[i] === '--change-db') {
                    changeDatabase();   // Меняем базу данных
                    return;
                } else if (arguments[i] === '-u') {
                    filterType = 'user'; // Фильтрация по имени или номеру пользователя
                    filterValue = arguments[i + 1]?.trim();
                } else if (arguments[i] === '-a') {
                    actionFilter = arguments[i + 1]; // Фильтр по действию
                } else if (arguments[i] === '-r') {
                    radiusFilter = parseFloat(arguments[i + 1]); // Радиус для фильтрации
                } else if (arguments[i] === '--teleport') {
                    if (i + 4 < arguments.length && arguments[i + 1] && arguments[i + 2] && arguments[i + 3] && arguments[i + 4]) {
                        teleportArgs = {
                            x: parseInt(arguments[i + 1]),
                            y: parseInt(arguments[i + 2]),
                            z: parseInt(arguments[i + 3]),
                            wid: parseInt(arguments[i + 4])
                        };
                    } else if (i + 3 < arguments.length && arguments[i + 1] && arguments[i + 2] && arguments[i + 3]) {
                        teleportArgs = {
                            x: parseInt(arguments[i + 1]),
                            y: parseInt(arguments[i + 2]),
                            z: parseInt(arguments[i + 3])
                        };
                    } else if (i + 1 < arguments.length && arguments[i + 1]) {
                        teleportArgs = {
                            wid: parseInt(arguments[i + 1])
                        };
                    } else {
                        // Команда --teleport без аргументов: вывод текущих координат
                        console.log('Текущие координаты:', playerCoords);
                        return;
                    }
                }
            }
            
            if (teleportArgs) {
                await handleTeleportation(teleportArgs);
            }
            
            getEventsWithinRadius(db, radiusFilter, filterType, filterValue, actionFilter);
        }
    });
})();

// Функция для обработки команды телепортации
async function handleTeleportation(args) {
    let { x, y, z, wid } = args;

    // Если не указан мир, используем текущий мир
    if (!wid) {
        wid = await getCurrentWorldId();
    }

    // Если не указаны координаты, используем последние координаты
    if (!x || !y || !z) {
        ({ x, y, z } = playerCoords);
    }

    // Получаем название мира
    const worldName = await getWorldNameById(wid);

    // Обрабатываем результаты
    if (worldName) {
        console.log(`Телепортирование в мир ${worldName} на координаты (${x}, ${y}, ${z}).`);
        playerCoords = { x, y, z }; // Обновляем координаты игрока
        
        try {
            await saveCoordsToFile(playerCoords); // Сохраняем координаты в файл
        } catch (error) {
            console.error('Ошибка при сохранении координат в файл:', error);
        }
    } else {
        console.log(`Мир с ID ${wid} не найден.`);
    }
}

// Функция сохранения координат в файл
async function saveCoordsToFile(coords) {
    try {
        await fs.promises.writeFile('./coords.json', JSON.stringify(coords), 'utf8');
        console.log('Координаты успешно сохранены в файл.');
    } catch (error) {
        console.error('Ошибка при сохранении координат в файл:', error);
    }
}

// Функция для получения событий в пределах заданного радиуса
function getEventsWithinRadius(db, radius, filterType, filterValue, actionFilter) {
    let sql = ` SELECT b.time, u.id, u.user, b.x, b.y, b.z, b.action FROM co_block AS b JOIN co_user AS u ON b.user = u.id `;

    let params = [];
    let whereClauseAdded = false; // Флаг для отслеживания первого условия WHERE

    // Добавляем условие по радиусу
    if (radius !== undefined && radius > 0) {
        if (!whereClauseAdded) {
            sql += ' WHERE ';
            whereClauseAdded = true;
        } else {
            sql += ' AND ';
        }
        
        sql += ` SQRT( POWER(b.x - ?, 2) + POWER(b.y - ?, 2) + POWER(b.z - ?, 2) ) <= ? `;
        params.push(playerCoords.x, playerCoords.y, playerCoords.z, radius);
    }

    // Добавление условия по типу фильтра
    if (filterType === 'user') {
        if (!whereClauseAdded) {
            sql += ' WHERE ';
            whereClauseAdded = true;
        } else {
            sql += ' AND ';
        }
        sql += `(u.user = ? OR u.id = ?)`;
        params.push(filterValue, filterValue);
    }

    // Добавление условия по действию
    if (actionFilter) {
        if (!whereClauseAdded) {
            sql += ' WHERE ';
            whereClauseAdded = true;
        } else {
            sql += ' AND ';
        }
        if (actionFilter === 'b+') {
            sql += 'b.action = 2';
        } else if (actionFilter === 'b-') {
            sql += 'b.action = 3';
        } else if (actionFilter === 'b') {
            sql += '(b.action = 2 OR b.action = 3)';
        } else if (actionFilter === 'b*') {
            sql += '(b.action != 1 AND b.action != 2 AND b.action != 3)';
        }
    }

    // Выполнение запроса
    db.all(sql, params, (err, rows) => {
        if (err) {
            throw err;
        }

        // Вывод результатов в консоль
        rows.forEach((row) => {
            const { time, id, user, x, y, z, action } = row;
            const readableTime = new Date(time * 1000).toLocaleString();
            let actionText;
            switch (action) {
                case 3:
                    actionText = 'поломка';
                    break;
                case 2:
                    actionText = 'установка';
                    break;
                case 1:
                    actionText = 'использование';
                    break;
                default:
                    actionText = 'неопределённое действие';
            }
            console.log(`Таймер: ${readableTime}, Пользователь: #${id} (${user}), Координаты: (${x}, ${y}, ${z}), Действие: ${actionText}`);
        });
    });
}



// Функция для получения названия мира по идентификатору
async function getWorldNameById(wid) {
    return new Promise((resolve, reject) => {
        db.get("SELECT world FROM co_world WHERE id = ?", [wid], (err, row) => {
            if (err) {
                reject(err);
            } else if (row) {
                resolve(row.world);
            } else {
                resolve(null); // Мир не найден
            }
        });
    });
}

// Функция помощи
function showHelp() {
    console.log(` Скрипт для работы с базой данных и событиями. Использование: node btest.js [опции] Опции: --help Показать это сообщение помощи. --change-db Изменить путь к базе данных. --teleport X Y Z WID Телепортирует игрока в указанный мир на указанные координаты. --teleport WID Телепортирует игрока в указанный мир на предыдущие координаты. --teleport Выводит текущие координаты игрока. -r RADIUS Указать радиус для фильтрации событий. -u USERNAME_OR_ID Фильтровать события по пользователю. -a ACTION Фильтровать события по действию ('b+', 'b-', 'b', 'b*'). Примеры: node btest.js --teleport 100 200 300 5 # Телепортация в мир с ID 5 на координаты (100, 200, 300) node btest.js --teleport 5 # Телепортация в мир с ID 5 на предыдущие координаты node btest.js --teleport # Вывод текущих координат node btest.js -r 10 # Показать события в радиусе 10 единиц node btest.js -u Brain # Показать события пользователя "Brain" node btest.js -a b+ # Показать события установки блоков node btest.js --change-db # Изменить путь к базе данных `);
}

// Функция для смены базы данных
function changeDatabase() {
    // Запрашиваем новый путь к базе данных
    const newDbPath = readlineSync.question('Укажите новый путь к базе данных (.db): ');
    const dbDir = path.dirname(newDbPath);

    // Проверяем существование указанной папки
    if (!fs.existsSync(dbDir)) {
        console.error(`Указанная директория "${dbDir}" не существует.`);
        process.exit(1);
    }

    // Обновляем конфигурационный файл
    fs.writeFileSync(
        configPath,
        JSON.stringify({
            dbPath: newDbPath  // Сохранение нового пути к базе данных
        }),
        'utf8'
    );
    console.log('Конфигурация успешно обновлена!');
}
