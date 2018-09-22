![Logo](admin/megad.png)

ioBroker MegaD-2561 adapter (Version by Filippovsky, based on adapter of ausHaus and BlueFox)
=================

### Current version: 0.23.42 ( 22.09.2018 17:41 MSK ) ALFA!!! PLEASE DO NOT INSTALL!!!!!
### Текущая версия:  0.23.42 ( 22.09.2018 17:41 MSK ) АЛЬФА!!! НЕ СТАВЬТЕ!!!

### ВАЖНО! Перед установкой внимательно прочтите changelog!
### После обновления версии - обязательно вручную перезапустите драйвер (в разделе "Настройки драйвера")

### ВНИМАНИЕ!! Этот драйвер еще не закончен. Для реальной работы его использовать пока нельзя. Можно использовать для целей общего ознакомления.

### ATTENTION! THIS DRIVER IS UNDER DEVELOPMENT NOW!! IT CAN NOT BE USED FOR REAL WORK!! USE IT JUST FOR INFORMATION!

[![NPM version](http://img.shields.io/npm/v/iobroker.megadjt.svg)](https://www.npmjs.com/package/iobroker.megadjt)
[![Downloads](https://img.shields.io/npm/dm/iobroker.megadjt.svg)](https://www.npmjs.com/package/iobroker.megadjt)

[![NPM](https://nodei.co/npm/iobroker.megadjt.png?downloads=true)](https://nodei.co/npm/iobroker.megadjt/)


Lets control the [MegaD-2561](http://www.ab-log.ru/smart-house/ethernet/megad-2561) over ethernet.

### Обработка событий от порта (как и других событий от Меги) и команды управлений портами пока не реализована!

### !! на данный момент поддерживаются ТОЛЬКО указанные типы портов:
### -  "не подключен" (NC) 
### -  стандартный вход (IN).
### - релейный (не симисторный и не димируеммый) выход
### !! Все остальные порты временно распознаются как NC.
### !! Это важно: При считывании настроек с Меги и записи настроек обратно - все порты Меги, кроме указанных выше, перейдут НА МЕГЕ в состояние NC !

### !! Тестируется на версии прошивки Меги 4.19b9, поэтому настройки, реализованные в более свежих прошивках - не поддерживаются!

### Кнопка "Сохранить и выйти" не сохраняет изменения, сделанные в настройках конкретного порта! 
### Она сохраняет общие настройки драйвера (ip-адрес, и т.п.)
### Для сохранения настроек порта используйте кнопку "Сохранить настройки порта".

### Важно правильно установить типы используемых исполнительных модулей, т.к. логика драйвера использует 
### эти значения для определения поведения и возможных типов и настроек портов. 
### Порты, выставленные в режим, не поддерживаемый выбранным исполнительным модулем, могут быть автоматически переведены драйвером в тип NC (не подключено).
### НО могут и не перейти (т.к. пока не везде реализовано) - и поведение драйвера может стать непредсказуемым.
### После изменения типов исполнительных модулей или пересчитывания настроек из Меги/файла - пока рекомендуется вручную  пройти по всем портам и сохранить их.
### В дальнейшем это будет автоматизировано

## English 
[по русски](#Русский)

## Install

```node iobroker.js add megadjt```

### Information
The device has 36 ports, inputs/outputs and DHT11/DHT22, I2C bus, DS18B20 in ports and 1WBUS.
To read the state of the port call
```http://mega_ip/sec/?pt=4&cmd=get``` , where sec is password (max 3 chars), 4 is port number
The result will come as "ON", "OFF" or analog value for analog ports

To set the state call:
```http://megad_ip/sec/?cmd=2:1``` , where sec is password (max 3 chars), 2 is port number, and 1 is the value
For digital ports only 0, 1 and 2 (toggle) are allowed, for analog ports the values from 0 to 255 are allowed

The device can report the changes of ports to some web server in form
```http://ioBroker:80/?pt=6```  , where 6 is the port number


-------------------
## Русский        
Подробную документацию можно найти здесь: [http://www.ab-log.ru/smart-house/ethernet/MegaD-2561](http://www.ab-log.ru/smart-house/ethernet/MegaD-2561)
    
### Настройки

- IP Адрес устройства: IP адрес MegaD-2561;
- MegaD Имя: Имя MegaD-2561 устройства для идентификации сообщений о смене состояния порта от MegaD-2561, например "DevA". Если имя не задано, то для этих целей будет использоватся номер инстанции драйвера.;
- ioBroker веб-порт: Порт на котором ioBroker разворачивает веб сервер для приёма сообщений от MegaD-2561. Значение по умолчанию: 80. 
- Интервал опроса (сек): инетрвал опроса портов в секундах;
- MegaD-2561 Пароль: пароль для доступа на MegaD-2561 (максимально 3 символа). Значение по умолчанию: "sec";
- Интервал для длинного нажатия (мс): если отжатие после нажатия кнопки произошло позже указанного интервала, то сгенерируется длинное нажатие;
- Интервал двойного нажатия (мс): если между нажатиями пройдет меньше указанного времени, то сгенерируется двойное нажатие;

В сетевых настройках MegaD-2561 можно сконфигуририровать IP-адрес ioBroker. При каждом нажатии на кнопку MegaD-2561 сообщает ioBroker (restAPI) номер сработавшего входа. 

Выглядит запрос примерно следующим образом:
´´´http://192.168.0.250/0/?pt=7´´´

### Порты
Необходимо сконфигурировать все порты, которые должны быть видимы в ioBorker. Для каждого порта необходимо настроить следующее:

- Имя: имя порта. Исползуется в ioBroker для создание объектов;
- Вход: является ли порт входом (true) или выходом(false);
- Переключатель: Может ли порт быть в положениях ВКЛ и ВЫКЛ (в этом случае значение TRUE) или он просто используется для сигнализирования нажатия на кнопку (FALSE);
- Цифровой: Цифровой или аналоговый порт. ioBroker ожидает значени с аналогового порта в промежутке от 0 до 255.
- Множитель:  множитель для значения **аналогового** порта.
- Сдвиг: сдвиг для значения **аналогового** порта.
- Длинное нажатие: если активировано, то порт будет генерировать событие "длинное нажатие" в объекте port_long (Порт должен быть цифровым и иметь тип "Переключатель")
- Двойное нажатие: если активировано, то порт будет генерировать событие "double click" в объекте port_double

Для выхода:

```
MegaЗначение = (ioBrokerЗначение - Сдвиг) / Множитель;
```

Для входа:

```
ioBrokerЗначение = MegaЗначение * Множитель + Сдвиг;
```

Например, чтобы получить интервал значений от 100 до 500 нужно установить сдиг 100 и множитель 400.

Только аналоговые порты принимают во внимание Множитель и Сдвиг.


### Отправка SMS
Сохраните текст SMS в переменную megadjt.0.sms.text с признаком ack:false
Драйвер автоматически отправит SMS, результат отправки будет помещен в лог.
Перед использованием этого функционала в настройках драйвера должны быть заполнены SMS API KEY и номера телефонов, на которые надо 
отправить SMS.
Номера вводятся в формате 79031234567 через запятую.
Для отправки SMS в настройках драйвера надо включить галочку "Включить отправку SMS".
          
## Changelog

### 0.22.13 (2018-09-13)
* (filippovsky) 
Реализована обработка сообщений от Меги к серверу об изменении состояния порта для типов портов "стандартный вход",
"релейный выход", "симисторный выход".
Добавлена поддержка однократных, двойных и длительных нажатий (информация о типе нажатия берется от Меги) у стандартных входов.
Для этих событий введены новые свойства (boolean state) у портов: 
- shortClick
- Release
- longClick
- doubleClick
Эти свойства дергаются каждый раз при получении команды от Меги, и при этом их значение не изменяется(!)
Свойство currentState при получении любого нажатия становится true, и будет в таком состоянии до получения Release.
Либо оно может быть сброшено при очередном получении данных обо всех портах.

Вот пример скрипта, которым можно отлавливать короткие нажатия на порту 0 Меги номер 0 (подразумевается, что порт 
сконфигурирован как стандартный вход в режиме "только нажатия":

on({id:'megadjt.0.ports.0.shortClick', change: "any"}, function (obj) {
    log('Нажата кнопка СВЕТ ХОЛЛ');
});

Важно не забывать указывать change: "any", т.к. по умолчанию скрипт вызывается только если новое значение state
отличается от предыдущего, а для свойства shortClick значение меняться не будет.

Также добавлено обновление счетчика стандартного входа, если пришла соответствующая команда от Меги

### 0.21.10 (2018-09-06)
* (filippovsky) 
При выборе функции порта "temperature" функция и комната прописываются теперь не у свойства  порта "currentState",
а у свойства порта "Temperature"

### 0.21.0 (2018-09-04)
* (filippovsky) 
Попытка начать делать собственную обработку изменений портов.
Пока сделано только для обычных выходов реле.

### 0.20.20 (2018-08-30)
* (filippovsky) 
Добавлены прошивки 4.28b9 - 4.29b4

### 0.20.8 (2018-07-24)
* (filippovsky) 
Работаем над возможностью менять привязанную к порту комнату/функцию

### 0.19.51 (2018-07-22)
* (filippovsky) 
Добавлены новые версии прошивки,
добавлен новый тип исполнительного устройства MEGAD-14IOR,
добавлена возможность получения прошивки с сайта ab-log.ru

### 0.19.0 (2018-03-24)
* (filippovsky) 
Переделываем способ считывания настроек в разделе настроек драйвера

### 0.18.18 (2018-03-22)
* (filippovsky) 
Добавлена прошивка 4.26b3

### 0.18.10 (2018-03-18)
* (filippovsky) 
АЛЬФА!! ТОЛЬКО ДЛЯ ТЕСТОВ!!!! Добавлено свойство порта DigitalSensorMode

### 0.18.9 (2018-03-18)
* (filippovsky) 
АЛЬФА!! ТОЛЬКО ДЛЯ ТЕСТОВ!!!! Добавлены свойства портов temperature и humidity

### 0.18.0 (2018-03-17)
* (filippovsky) 
АЛЬФА!! ТОЛЬКО ДЛЯ ТЕСТОВ!!!! Переделываем опрос Меги от сервера

### 0.17.6 (2018-03-17)
* (filippovsky) 
Добавлены прошивки v4.21b1-4.26b2
Включена версия скрипта прошивки 2.06
Уменьшена ширина настроечных дополнительных экранов для корректного вывода в Admin 3.0

### 0.17.5 (2017-12-23)
* (filippovsky) 
Добавлены прошивки v4.20b6-4.20b9

### 0.17.4 (2017-12-05)
* (filippovsky) 
Добавлены прошивки v4.20b2 - 4.20b5

### 0.17.0 (2017-12-01)
* (filippovsky) 
Добавлена прошивка v4.20b1
В тестовом режиме реализовано конфигурирование типа порта "Релейный выход". Симисторные и димируемые выходы пока не сделаны. Реализовано пока только конфигурирование, но не управление и чтение портв.

### 0.16.33 (2017-11-26)
* (filippovsky) 
Отключена кнопка "Записать настройки в Мегу".
На время сохранения порта гасятся другие кнопки, по окончании сохранения - кнопки включаются.
Исправлен ряд ошибок

### 0.16.29 (2017-11-25)
* (filippovsky) 
Реализовано считывание данных о портах с Меги в ioBroker.
При сохранении настроек порта - настройки порта сразу сохраняются и в Меге.
Обработка событий от порта пока не реализована!
Кнопка "записать настройки в Мегу" - пока не реализована, не пользуйтесь ей!
!! на данный момент поддерживаются ТОЛЬКО тип порта "не подключен" (NC) и стандартный вход (IN).
!! Все остальные порты временно распознаются как NC.
!! Это важно: При считывании настроек с Меги и записи настроек обратно - все порты Меги кроме NC и IN перейдут НА МЕГЕ в состояние NC !

!! Тестируется на версии прошивки Меги 4.14b8, поэтому настройки, реализованные в более свежих прошивках - не поддерживаются!

### 0.14.0 (2017-11-12)
* (filippovsky) добавлена поддержка отправки SMS-сообщений

### 0.12.0 (2017-10-14)
* (filippovsky) добавлены новые прошивки

### 0.8.0 (2017-09-07)
* (filippovsky) добавлены 8I7O-S и 8I7O-SD

### 0.7.19 (2017-08-27)
* (filippovsky) добавлена версия прошивки v4.16b3

### 0.7.18 (2017-08-17)
* (filippovsky) добавлены версии прошивок v4.15b2 - 4.15b9

### 0.5.2 (2017-03-28)
* (filippovsky) добавлены версии прошивок v4.13b6 и v4.13b7

### 0.5.0 (2017-03-27)
* (filippovsky) fw_version и fw_version_last_known перенесены из канала version

### 0.4.2 (2017-03-23)
* (filippovsky) Добавлена возможность аварийной перепрошивки Меги (режим bootloader)

### 0.4.1 (2017-03-23)
* (filippovsky) При прошивке версии можно выбрать прошиваемую версию. К версиям добавлены дата выхода и краткое описание

### 0.3.35 (2017-03-19)
* (filippovsky) При выборе модели исполнительного модуля - показываем картинку

### 0.3.15 (2017-03-19)
* (filippovsky) После сохранения настроек Меги в файл - он копируется в папку ioBroker/etc/iobroker.megadjt,
чтобы не потерять его при обновлении версии драйвера

### 0.3.10 (2017-03-19)
* (filippovsky) Возможность сохранения настроек Меги в файл

### 0.3.0 (2017-03-18)
* (filippovsky) Возможность перепрошивки Меги

### 0.2.30 (2017-03-14)
* (filippovsky) В настройках драйвера добавлено отображение текущей версии прошивки устройства

### 0.2.0 (2017-03-08)
* (filippovsky) Добавлены новые свойства: version.firmware_last_known

### 0.1.49 (2017-03-08)
* (filippovsky) Добавлены новые свойства: version.controller_model

### 0.1.48 (2017-03-08)
* (filippovsky) Добавлены новые свойства: version.firmware и version.is_firmware_actual

### 0.1.35 (2017-02-26)
* (filippovsky) Добавлена поддержка датчиков температуры DS18B20 на 1-wire шине

### 0.1.34 (2017-02-26)
* (filippovsky) исправлена ошибка оригинального драйвера Megadd.
Ошибка проявлялась в неправильном алгоритме опроса портов, сконфигурировааных как 1WBUS,
что приводило к утечкам памяти и перенагрузке сетевого интерфейса

### 0.1.8 (2017-02-18) - 0.1.33 (2017-02-25)
* (filippovsky) добавлена функция getFirmwareVersion( )
Запрашивает у Меги версию прошивки и заносит ее в базу.
Может быть использовано для определения набора поддерживаемых прошивкой функций 
и для определения необходимости обновления прошивки.

### 0.1.4 (2017-02-17)
* (filippovsky) initial commit

### 0.1.3 (2017-01-07)
* (ausHaus) add I2C Bus (HTU21D, BH1750, TSL2591)

### 0.1.2 (2016-11-23)
* (ausHaus) add DS2413 out A/B

### 0.1.0 (2016-11-01)
* (ausHaus) initial commit

