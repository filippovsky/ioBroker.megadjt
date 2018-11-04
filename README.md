![Logo](admin/megad.png)

ioBroker MegaD-2561 adapter (Version by Filippovsky, based on adapter of ausHaus and BlueFox)
=================

### Current version: 0.34.2 ( 04.11.2018 14:29 MSK ) ALFA!!! PLEASE DO NOT INSTALL!!!!!
### Текущая версия:  0.34.2 ( 04.11.2018 14:29 MSK ) АЛЬФА!!! НЕ СТАВЬТЕ!!!

### ВАЖНО! Перед установкой внимательно прочтите changelog!
### После обновления версии - обязательно вручную перезапустите драйвер (в разделе "Настройки драйвера")

### ВНИМАНИЕ!! Этот драйвер еще не закончен. Для реальной работы его использовать пока нельзя. Можно использовать для целей общего ознакомления.

### ATTENTION! THIS DRIVER IS UNDER DEVELOPMENT NOW!! IT CAN NOT BE USED FOR REAL WORK!! USE IT JUST FOR INFORMATION!

[![NPM version](http://img.shields.io/npm/v/iobroker.megadjt.svg)](https://www.npmjs.com/package/iobroker.megadjt)
[![Downloads](https://img.shields.io/npm/dm/iobroker.megadjt.svg)](https://www.npmjs.com/package/iobroker.megadjt)

[![NPM](https://nodei.co/npm/iobroker.megadjt.png?downloads=true)](https://nodei.co/npm/iobroker.megadjt/)


Lets control the [MegaD-2561](http://www.ab-log.ru/smart-house/ethernet/megad-2561) over ethernet.

### !! на данный момент поддерживаются ТОЛЬКО указанные типы портов:
### - "не подключен" (NC) 
### - стандартный вход (IN).
### - релейный, симисторный, димируеммый выход
### - цифровой вход (ограниченно)
### !! Все остальные порты временно распознаются как NC.
### !! Это важно: При считывании настроек с Меги и записи настроек обратно - все порты Меги, кроме указанных выше, перейдут НА МЕГЕ в состояние NC !

!! Тестируется на версии прошивки Меги 4.19b9, поэтому настройки, реализованные в более свежих прошивках - не поддерживаются!

Кнопка "Сохранить и выйти" не сохраняет изменения, сделанные в настройках конкретного порта! 
Она сохраняет общие настройки драйвера (ip-адрес, и т.п.)
Для сохранения настроек конкретного порта - используйте кнопку "Сохранить настройки порта".

Важно правильно установить типы используемых исполнительных модулей, т.к. логика драйвера использует 
эти значения для определения поведения и возможных типов и настроек портов. 
Порты, выставленные в режим, не поддерживаемый выбранным исполнительным модулем, могут быть автоматически переведены драйвером в тип NC (не подключено).
НО могут и не перейти (т.к. пока не везде реализовано) - и поведение драйвера может стать непредсказуемым.
После изменения типов исполнительных модулей или пересчитывания настроек из Меги/файла - пока рекомендуется вручную  пройти по всем портам и сохранить их.
В дальнейшем это будет автоматизировано.

### СОЗДАНИЕ НОВОЙ ИНСТАНЦИИ:
1. В разделе "Драйвера" выберите драйвер "MegaD-2561 JT Adapter" и нажмите "Установить драйвер"
2. В открывшемся окне выберите номер для создаваемой инстанции и нажмите кнопку "Добавить"
3. Дождитесь окончания установки новой инстанции. Автоматически откроется окно настроек новой инстанции. 
   Появится сообщение "Enable adpater first".
   Закройте сообщение кнопкой ОК и выйдите из диалога настроек БЕЗ СОХРАНЕНИЯ, кнопкой "Закрыть" 
4. На экране увидите раздел "Настройки". В нем Вы увидите созданную инстанцию, в состоянии "Неактивно": 
   индикатор инстанции (кружок в крайнем левом столбце - серого цвета, кнопка запуска инстанции окрашена в красный цвет).
   Нажмите кнопку запуска инстанции. Индикатор инстанции загорится красным, затем желтым, 
   а кнопка запуска - зеленым и превратится в кнопку ПАУЗА.
5. Подождите минуту. За это время драйвер создаст все необходимые объекты на сервере и присвоит им дефолтные значения.
6. Перейдите в раздел "Лог". Убедитесь, что там есть сообщение от новой инстанции типа "warn" с текстом "IP is null or 0.0.0.0".
   Это говорит о том, что создание объектов окончено.
7. Перейдите в раздел "Настройки", найдите созданную инстанцию и нажмите кнопку "перезагрузить", чтобы драйвер пересчитал настройки.
   Индикатор инстанции загорится красным, затем желтым. Обратите внимание - инстанция с этого момента будет настроена 
   на IP-адрес по умолчанию (192.168.0.14), поэтому желательно к этому моменту не иметь в сети узла 192.168.0.14, 
   иначе могут возникнуть проблемы.
8. Нажмите кнопку "Настроить" на созданной инстанции (кнопка с гаечным ключом). Откроется диалог настроек.
9. Задайте следующие настройки:
      - IP Адрес устройства. По умолчанию 192.168.0.14, его надо заменить на реальный IP-адрес Меги.
        Если Ваша Мега имеет адрес 192.168.0.14 - лучше его на ней поменять (средствами самой Меги, см. http;//192.168.0.14/sec ), 
        иначе будут проблемы, напрмиер, при обновлениях прошивок.
        Дело в том, что после прошивки со сбросом энергонезависимой памяти - перепрошитая Мега автоматически 
        получает адрес 192.168.0.14.
        И если у Вас в сети больше одной Меги и одна из них сидит на адресе 192.168.0.14, а другую Вы начнете прошивать - возникнет
        конфликт ip-адресов после перепрошивки.
        При прошивке Меги нашим драйвером - сначала драйвер меняет адрес на Меге на 192.168.0.14, затем прошивает этот адрес, 
        затем возвращает адрес на тот, который был до прошивки. Если у Вас в сети будут другие Меги с адресом 192.168.0.14 - 
        понятно, что это приведет к проблемам во время прошивки драйвером.
      - IP-порт контроллера. По умолчанию 80.
      - IOBroker веб-порт. По умолчанию для инстанции 0 будет порт 91, для инстанции 1 порт 92 и т.п.
        Если необходимо (например, когда этот порт занят другими сервисами) - можете задать свое значение.
      - MegaD пароль. По умолчанию sec. Надо указать пароль Меги, которая будет соответствовать этой инстанции.
      - Интервал опроса = 60 секунд. Если укажете 0 - то опрос Меги драйвером выполняться не будет.
        В этом случае Вам надо будет обновлять значения на сервере либо самостоятельными скриптами, либо настроить 
        автоматическую передачу параметров с Меги 1 раз в минуту (см. ниже)
      - IP-адрес шлюза. Если сервер находится в той же сети, что и Мега - то введите 255.255.255.255
      - IP-адрес сервера IOBroker. Сюда введите адрес сервера, на который должна будет обращаться Мега.
        Это значение будет передано позже на Мегу.
      - Скрипт сервера. Например, для инстанции 0 - это будет /0, для инстанции 1 - /1 и т.п.
      - Тип сервера IOBroker. Выберите "HTTP". Другие режимы пока не реализованы.
      - Порт WatchDog. Выберите "Не выбран". Его при необходимости настроите позже, после настроек всех портов.
      - "Передавать данные с Меги 1 раз в минуту". Если поставите галочку - на Меге будет включен режим srv-loop
        и Мега сама будет автоматически слать на адрес сервера значения всех портов 1 раз в минуту.
      - XP1. Укажите тип исполнительного модуля, подключенного к разъему Меги XP1. 
      - XP2. Укажите тип исполнительного модуля, подключенного к разъему Меги XP2. 
      Если к разъему XP1 или XP2 не подключен исполнительный модуль - выберите в соответствующем поле "Не подключено".
10. Сохраните настройки на сервер, кнопкой "Сохранить и выйти" в нижней части экрана настроек.
11. Дождитесь, пока индикатор инстанции (кружочек) загорится зеленым. Снова зайдите в настройки инстанции (кнопка с гаечным ключом)
12. Нажмите кнопку "Считать ВСЕ настройки с Меги". В появившемся окне подтвердите считывание кнопкой "Да". 
    Дождитесь окончания считывания - появления сообщения "Настройки портов считаны с Меги". Нажмите ОК.
13. Проверьте настройки Меги, которые вводились в пункте 9. 
    13.1 При необходимости поправьте их, для чего:
          13.1.1 введите новые значения
          13.1.2 сохраните настройки на сервер кнопкой "Сохранить и выйти".
          13.1.3 снова зайдите в настройки инстанции (кнопка с гаечным ключом)
          13.1.4 передайте новые настройки на Мегу кнопкой "Сохранить настройки в Мегу".
                 По этой кнопке передаются только настройки самой Меги, без настроек конкретных портов.
          13.1.5 в открывшемся окне подтверждения записи в Мегу нажмите "Да".
          13.1.6 Дождитесь сообщения "Настройки переданы в Мегу". Нажмите ОК. 
14. Сохраните настройки на сервер (кнопка "Сохранить" внизу окна настроек инстанции).
15. Пройдитесь по всем портам Меги (порт можно выбрать, щелкнув на его индикатор на картинке исполнтельного модуля).
    При необходимости поправьте настройки.
    Как минимум - у порта, как правило, надо будет указать комнату и функцию)
    Если настройка порта поменялась - сохраните новую настройку кнопкой "Сохранить настройки порта".
    Эта кнопка сохраняет только настройки для данного порта, при этом сохранение делается на сервер и сразу же передается на Мегу.
16. Если хотите использовать историю значений порта - это можно сделать в разделе "Объекты".
    Например, нас интересует хранение истории порта 27 инстанции 0.
    - Нажимаем в админ-интерфейсе "Категории"
    - в дереве находим megadjt.0, раскрываем его щелчком на стрелочке слева от названия
    - открываем ветку ports
    - находим ветку 27, открываем
    - среди настроек порта находим интересующий нас параметр. Обычно это "currentState".
      но может быть и "counter", если нам нужна история изменений счетчика порта. 
      Если к порту подключен например, датчик температуры, то нас будет интересовать параметр "temperature",
      т.к. в нем будет лежать значение температуры, например, "6.93" распарсенное из  currentState=temp:6.93
    - в ветке с параметром есть кнопка с гаечным ключом (крайняя справа). нажмите ее и задайте настройки хранения истории
      для данного параметра

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
    
### Отправка SMS
Отправка SMS возможна двумя способами - средствами самой Меги (нужен GSM-модем, функционал обеспечивается прошивкой)
и средствами нашего драйвера (отправка происходит через интернет, GSM-модем не нужен, функционал обеспечивается драйвером).
Подробности см. ниже

### Отправка SMS средствами драйвера
Настройки для отправки средствами драйвера - делаются кнопкой "SMS Setup" в настройках драйвера.
Сохраните текст SMS в переменную megadjt.0.sms.text с признаком ack:false
Драйвер автоматически отправит SMS, результат отправки будет помещен в лог.
Перед использованием этого функционала в настройках драйвера должны быть заполнены SMS API KEY и номера телефонов, на которые надо 
отправить SMS.
Номера вводятся в формате 79031234567 через запятую.
Для отправки SMS в настройках драйвера надо включить галочку "Включить отправку SMS".
Отправка SMS делается через интернет, не требуется GSM-модем.

### Отправка SMS средствами Меги
Отправка делается через GSM-Модем, подключенный к Меге.
Возможность отправки включается галочкой "Отправка SMS средствами Меги" в настройках драйвера.
Отправка делается на номер, указанный в поле "Номер телефона для отправки SMS средствами Меги".
Поле "Таймаут отправки SMS средствами Меги":
Можно указать время в секундах (от 1 до 254), в течение которого не отправлять SMS о срабатывании входов.
Например, если установить значение 5 - это означает, что в течение 5 секунд все события, которые будут происходить с любыми входами, будут проигнорированы с точки зрения отправки SMS оповещений (но не с точки зрения выполнения сценариев и прочего).

### Обработка событий от стандартных входных портов (кнопок)
Добавлена поддержка однократных, двойных и длительных нажатий (информация о типе нажатия берется от Меги) у стандартных входов.
Для этих событий есть свойства (boolean state) у порта: 
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

          
## Changelog

### 0.34.0 (2018-11-04)
* (filippovsky) 
Поле "Значение по умолчанию" адаптировано для димируемых портов 

### 0.33.0 (2018-11-03)
* (filippovsky) 
У типа порта "Димируемый выход" добавлено поле "Частота".

### 0.32.0 (2018-10-31)
* (filippovsky) 
!! Важное изменение !!
Переделано присвоение первоначальных значений.
Необходимо удалить все текущие инстанции и создать их заново.

### 0.31.0 (2018-10-30)
* (filippovsky) 
У типа порта "Стандартный выход" добавлено поле "Группа".

### 0.30.0 (2018-10-30)
* (filippovsky) 
У типа порта "Стандартный выход" добавлено поле "Режим работы выхода".

### 0.29.0 (2018-10-29)
* (filippovsky) 
У типа порта "Стандартный вход" добавлено поле "Отправка SMS средствами Меги".
Поле отображается, если включена галочка "Отправлять SMS средствами Меги".

### 0.28.35 (2018-10-26)
* (filippovsky) 
Добавлена прошивка версии v4.30b5

### 0.28.4 (2018-10-20)
* (filippovsky) 
Добавлена прошивка версии v4.30b4

### 0.28.2 (2018-10-19)
* (filippovsky) 
Багфикс: сохранение данных температуры и влажности в соответствующие свойства порта (temperature/humidity)

### 0.27.43 (2018-10-19)
* (filippovsky) 
Добавлена прошивка версии v4.30b2
Добавлена прошивка версии v4.30b3
Рефакторинг кода

### 0.27.42 (2018-10-19)
* (filippovsky) 
Рефакторинг кода.

### 0.26.16 (2018-10-11)
* (filippovsky) 
Скрипт прошивки Меги заменен на скрипт v2.09 от 18.08.2018.
Изменена работа функции "Сохранить настройки порта". Ранее новые настройки могли не доходить до Меги в случае, если менялся тип порта.
Рефакторинг кода.

### 0.25.0 (2018-10-09)
* (filippovsky) 
Добавлена прошивка версии v4.30b1

### 0.24.97 (2018-10-09)
* (filippovsky) 
Устранено кэширование в админрежиме, которое приводило к неправильным отображениям цвета порта.
В режиме "настройки драйвера" теперь цвет портов должен соответствовать текущим настройкам портов,
т.е. на изображении исполнительного модуля зеленые лампы - это порты входов, красные - порты выходов,
текущий выбранный порт - желтый.
При этом лампы в интерфейсе светятся только на настроенных портах и не светятся на отключенных портах.
Для настройки порта нужно щелкнуть по его лампочке левой кнопкой мыши.

Работы над устранением кэширования продолжатся: в следующих версиях будет убран баг, из-за которого
настройки порта сохраняются, но при следующем просмотре показываются взятые из кэша.

### 0.24.41 (2018-09-30)
* (filippovsky) 
Добавлены новые режимы прошивки: 
"взять релиз с сайта +сброс EEPROM" 
"взять бета-версию с сайта +сброс EEPROM"

### 0.24.34 (2018-09-30)
* (filippovsky) 
Добавлено новое исполнительное устройство MegaD 8I7O-R

### 0.24.33 (2018-09-30)
* (filippovsky) 
Добавлена прошивка 4.29b9

### 0.24.32 (2018-09-29)
* (filippovsky) 
В ПРОЦЕССЕ - переделка кода admin/index.html, для того, чтобы убрать кэширование данных в "настройках драйвера".
Устранена ошибка, из-за которой сохранение порта могло происходить сразу на все инстанции.
Добавлена прошивка 4.29b8

### 0.23.49 (2018-09-24)
* (filippovsky) 
Добавлена прошивка версии 4.29b5

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

