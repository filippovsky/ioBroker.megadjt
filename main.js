/**
 *      ioBroker MegaD-2561 Adapter
 *      11'2016 ausHaus
 *      Lets control the MegaD-2561 over ethernet (http://www.ab-log.ru/smart-house/ethernet/megad-2561)
 *
 *
 *      The device has 36 ports inputs/outputs and DSen, I2C, 1Wire bus.
 *      To read the state of the port call
 *      http://mega_ip/sec/?pt=4&cmd=get , where sec is password (max 3 chars), 4 is port number
 *      The result will come as "ON", "OFF" or analog value for analog ports
 *
 *      To set the state call:
 *      http://mega_ip/sec/?cmd=2:1 , where sec is password (max 3 chars), 2 is port number, and 1 is the value
 *      For digital ports only 0, 1 and 2 (toggle) are allowed, for analog ports the values from 0 to 255 are allowed
 *
 *      The device can report the changes of ports to some web server in form
 *      http://ioBroker:8090/?pt=6  , where 6 is the port number
 *
 *
 
ветки входов для настроек портов:
savePort - изменение в интерфейсе настроек драйвера
parseMegaCfgLine - загрузка из файла настроек

- изменение типа исполнительного модуля в интерфейсе настроек
- загрузка настроек из файла на сервер и сохранение с сервера в файл (?)
----------------------------
ToDO: 

- при смене типа исполнительного модуля, при чтении конфигурации из Меги, и при чтении из файла :
    - проверять типы  портов на  соответствие исполнительному модулю. При несоответствии делаем NC.
 надо продумать проверку разных типов выходов, соответствующих одному типу pty (симисторы/реле/ШИМ)

-(?) если порт переводим  в NC - хорошо бы его принудительно выключить xx:0 

- реализовать оставшиеся типы портов

- реализовать st=1, опрос портов, обработку команд, обработку srvloop, отправку команд

*/

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

var utils  = require(__dirname + '/lib/utils'); // Get common adapter utils
//var tools  = require(__dirname + '/lib/tools'); // npm?
var http   = require('http');
var fs     = require('fs');
var process = require('child_process');
var server =  null;
var ports  = {};
///var askInternalTemp = false;
var ask1WireTemp = false;   //1Wire
var connected = false;
var fw_version_actual = "4.30b5";

var adapter = utils.adapter(  'megadjt' );
var sms_ru  = require('sms_ru');

//var IP_And_Port;  // ip + port
//var Host;
var IP;
var IPPort;
var Password;
var ControllerName;
var ServerPort;


var IsDisplayPresented = false; // пока ориентируемся на тип порта I2C, в будущем поправить на конкретный девайс

var cPortType_NotConnected = 'NotConnected'; //255
var cPortType_StandartIn  = 'StandartIn';    //0
var cPortType_ReleOut = 'ReleOut';           //1
var cPortType_DimmedOut = 'DimmedOut'; //1
var cPortType_SimistorOut = 'SimistorOut'; //1
var cPortType_DS2413 = 'DS2413';           //1
var cPortType_DigitalSensor  = 'DigitalSensor'; //3 цифровой вход dsen
var cPortType_I2C  = 'I2C'; // 4 
var cPortType_AnalogSensor  = 'AnalogSensor'; // 2 АЦП-вход для аналоговых датчиков

var cNPortType_NotConnected = '255'; 
var cNPortType_StandartIn  = '0';    
var cNPortType_Out = '1';           
var cNPortType_DigitalSensor  = '3';
var cNPortType_I2C  = '4';
var cNPortType_AnalogSensor  = '2'; 

var cPortMode_PressOnly = 'PressOnly';
var cPortMode_PressAndRelease = 'PressAndRelease';
var cPortMode_ReleaseOnly = 'ReleaseOnly';
var cPortMode_ClickMode = 'ClickMode';
var cPortMode_SW = 'Switch';

var cNPortMode_PressOnly = '0';
var cNPortMode_PressAndRelease = '1';
var cNPortMode_ReleaseOnly = '2';
var cNPortMode_ClickMode = '3';
var cNPortMode_SW = '0';

var cDigitalSensorTypeDS18B20 = 'DS18B20'; //3
var cDigitalSensorTypeDHT11   = 'DHT11'; //1
var cDigitalSensorTypeDHT22   = 'DHT22'; //2
var cDigitalSensorTypeMarine  = 'iButton/EMMarine';//4
var cDigitalSensorType1WBus   = '1WireBUS';//5
var cDigitalSensorTypeWiegand26   = 'Wiegand26';//6

var cNDigitalSensorTypeDS18B20 = 3;
var cNDigitalSensorTypeDHT11   = 1;
var cNDigitalSensorTypeDHT22   = 2;
var cNDigitalSensorTypeMarine  = 4;
var cNDigitalSensorType1WBus   = 5;
var cNDigitalSensorTypeWiegand26   = 6;

var cXPModelNone   = 'none';
var cXPModel7I7OR  = '7I7O-R';
var cXPModel8I7OR  = '8I7O-R';
var cXPModel7I7OSD = '7I7O-SD';
var cXPModel8I7OS  = '8I7O-S';
var cXPModel8I7OSD = '8I7O-SD';
var cXPModel14In   = '14-IN';
var cXPModel14IOR  = '14-IOR';
var cXPModel14R1   = '14-Rv1.0';
var cXPModel14R2   = '14-Rv2.0';
var cXPModel2R     = '2R';

var cGSMmodeNo     = 'No';
var cGSMmodeAlways = 'Always';
var cGSMmodeArmed  = 'Armed';

var cOutPortMode_SW  = 'Switch';
var cOutPortMode_PWM = 'PWM';
var cOutPortMode_SWLINK = 'SWLink';
var cOutPortMode_DS2413 = 'DS2413';

var cPWM_Freq_Normal = 'Normal';  //0
var cPWM_Freq_Low    = 'Low';     //1
var cPWM_Freq_High   = 'High';    //2

//            var settings = adapter.config.ports[p];
//-------------------------------------------------------------------------------------------------------------------
adapter.on('stateChange', function (id, state) {
    var sms_id = adapter.namespace + '.sms.text';
    var portnum = '';

    var matched = [];
    //adapter.log.debug('stateChange: id ='+id+'  state='+state.val+'  ack='+state.ack);
    if (id && state && !state.ack) {
        //matched = id.match(/megadjt\.(.*?)\.xp(.*?)/);
        if (state.val === 'false' || state.val === false) state.val = 0;
        if (state.val === 'true'  || state.val === true)  state.val = 1;

        if (id == sms_id ) {
            if ( state.val !== '' ) {
               //adapter.log.debug('Обнаружен новый текст смс');
               var SMSru = require('sms_ru');        
               adapter.getState('sms.enabled', function(err,state) {
                  var sms_enabled = state.val;
                  if ( sms_enabled == 'true' || sms_enabled == true  ) {
                     adapter.getState('sms.apiKey', function (err, state) {
                        var api_id = state.val;
                        //adapter.log.debug('sms api key = '+ api_id);
                        if ( api_id == "" ) {
                           adapter.log.warn('В настройках драйвера megadjt не задан SMS API KEY');
                        } else {
                           var sms = new SMSru(api_id);
                           adapter.getState('sms.phones', function (err, state) {
                              var phones = state.val;
                              if ( phones == '' ) {
                                 adapter.log.warn('Не заданы в настройках номера телефонов для отправки SMS');
                              } else {
                                 //adapter.log.debug('sms phones = '+ phones );
                                 adapter.getState('sms.text', function (err, state) {
                                    var textsms = state.val;
                                    var pid=202290;        
                                    adapter.log.info('отправляем смс "'+textsms+'" на номер '+phones);        
                                    sms.sms_send({
                                          to:   phones,
                                          text: textsms,
                                          partner_id: pid
                                       }, function(e){
                                              adapter.log.info(e.description);
                                          }
                                    ); 
                                    adapter.setState( 'sms.text', {val: "", ack: true});
                                });
                             }
                          });
                        }
                     });
                  }
               });
            }
            return;
        }

        matched = id.match(/xp(.*?)/);
        if ( matched ) {
           var xpid = adapter.namespace + '.controller.'+id+'.model';
           adapter.setState( xpid, {val: state.val, ack: true});           
           adapter.log.info('Изменился исполнительный модуль ' + id + ' на ' + state.val);
           return;
        } 

        /*
        if (!ports[id]) {
            adapter.log.error('Unknown port ID ' + id);
            return;
        }
        if (!ports[id].common.write) {
            adapter.log.error('Cannot write the read only port ' + id);
            return;
        }
*/


        portnum = id.replace(/^megadjt\.(.*?)\.ports\.(.*?)\.currentState$/, '$2');

        adapter.log.info('try to control port ' + portnum + ' with ' + state.val);

        adapter.log.debug('control 1');
        adapter.log.debug('control 2');
        adapter.log.debug('state.ack = ' + state.ack);
        adapter.log.debug('state.val = ' + state.val);
        adapter.log.debug('state.from = ' + state.from);
        if (state.ack == 0 || state.ack == false) {
           adapter.log.debug('control 3');
           // значение изменено из веб-интерфейса
           adapter.log.debug('ack = false');
           adapter.getState( adapter.namespace + '.ports.' + portnum + '.portType', function (err, portType) {
              adapter.log.debug('control 4');
              if (portType) {
                 adapter.log.debug('control 5');
                 adapter.log.debug('porttype.val = ' + portType.val);

                 if (portType.val == cPortType_ReleOut) {
                    adapter.log.debug('control 6');
                    sendCommand( portnum, state.val );
                    setTimeout(function () {
                       adapter.log.debug('Пауза истекла ... ');
                        getPortState( portnum, processPortState);
                    }, 1000);
                 }
              }
           });
        }



/*
        adapter.getState( adapter.namespace + '.ports.' + portnum + '.currentState', function (err, curState) {
           adapter.log.debug('control 1');
           if (curState) {
              adapter.log.debug('control 2');
              adapter.log.debug('curstate.ack = ' + curState.ack);
              adapter.log.debug('curstate.val = ' + curState.val);
              adapter.log.debug('curstate.from = ' + curState.from);
              if (curState.ack == 0 || curState.ack == false) {
                 adapter.log.debug('control 3');
                 // значение изменено из веб-интерфейса
                 adapter.log.debug('ack = false');
                 adapter.getState( adapter.namespace + '.ports.' + portnum + '.portType', function (err, portType) {
                     adapter.log.debug('control 4');
                     if (portType) {
                        adapter.log.debug('control 5');
                        if (portType.val == cPortType_ReleOut) {
                          adapter.log.debug('control 6');
                           sendCommand( portnum, curState.val );
                           setTimeout(function () {
                              adapter.log.debug('Пауза истекла ... ');
                              getPortState( portnum, processPortState);
                           }, 1000);
                        }
                     }
                 });
              }
           }
        });
*/

/*
        if (parseFloat(state.val) == state.val) {
            // If number => set position
            state.val = parseFloat(state.val);
            if (state.val < 0) {
                adapter.log.warn(': invalid control value ' + state.val + '. Value must be positive');
                state.val = 0;
            }

            if (ports[id].common.type == 'boolean' && state.val !== 0 && state.val != 1) {
                adapter.log.warn(': invalid control value ' + state.val + '. Value for switch must be 0/false or 1/true');
                state.val = state.val ? 1 : 0;
            }

            if (ports[id].common.type == 'boolean') {
		if (id.indexOf('_A') !== -1) {                    // DS2413
                    sendCommandToDSA(ports[id].native.port, state.val);
                } else
                if (id.indexOf('_B') !== -1) {                    // DS2413
                    sendCommandToDSB(ports[id].native.port, state.val);
                } else
                sendCommand(ports[id].native.port, state.val);
            } else if (id.indexOf('_counter') !== -1) {
                sendCommandToCounter(ports[id].native.port, state.val);
            } else {
                ports[id].native.offset = parseFloat(ports[id].native.offset || 0) || 0;
                ports[id].native.factor = parseFloat(ports[id].native.factor || 1) || 1;

                state.val = (state.val - ports[id].native.offset) / ports[id].native.factor;
                state.val = Math.round(state.val);

                sendCommand(ports[id].native.port, state.val);
            }
        }
*/

    }
});

//---------------------------------------------------------------------------------------
adapter.on('ready', function (obj) {
    main();
});

//--------------------------------------------------------------------------------------
adapter.on('message', function (obj) {
    if (obj && obj.command) {
        switch (obj.command) {
            case 'send':
                processMessage(obj.message);
                break;

            case 'discover':
                discoverMega(obj);
                break;

            case 'states2Admin':
                states2Admin(obj);
                break;

            /*case 'detectPorts':
                detectPorts(obj);
                break;*/

            case 'readCfgFromMega':
                readCfgFromMega(obj);
                break;

            case 'writecf2mega':
                writecf2mega(obj);
                break;

            case 'savePort':
                savePort(obj);
                break;

/*            case 'saveAdmin':
                saveAdmin(obj);
                break;*/

            case 'writeConfig':
                writeConfig(obj);
                break;

            case 'updateFirmware':
                updateFirmware(obj.message);
                break;

            case 'getFirmware':
                getFirmwareVersion();
                break;

            default:
                adapter.log.warn('Unknown message: ' + JSON.stringify(obj));
                break;
        }
    }
    processMessages();
});



// Функция получения версии прошивки Меги ---------------------------------------------------
function getFirmwareVersion() {
    var version = '';
    //var parts = adapter.config.ip.split(':');
    var actual_version = '';
    var controller_model = '';

    var options = {
        host: IP,
        port: IPPort,
        path: '/' + Password
    };
    if (!IP) {
       adapter.log.warn('getFirmwareVersion not executed, because host is null');
    } else {
       adapter.log.debug('getFirmwareVersion http://' + IP + options.path);

       http.get(options, function (res) {
          var xmldata = '';
          res.on('error', function (e) {
              adapter.log.warn('getFirmwareVersion error: ' + e);
          });
          res.on('data', function (chunk) {
              xmldata += chunk;
              //adapter.log.debug('getFirmwareVersion get: ' + chunk);
          });
          res.on('end', function () {
              if (res.statusCode != 200) {
                 adapter.log.warn('getFirmwareVersion Response code: ' + res.statusCode + ' - ' + xmldata);

              } else {

                 // Вырезаем из данных версию прошивки
                 //adapter.log.debug('getFirmwareVersion response for ' + adapter.config.ip + "[" + options.port + ']: ' + xmldata);
                 version = xmldata.replace(/^(.*?)fw\:\s(.*?)\)(.*?)$/, '$2');
                 controller_model = xmldata.replace(/^(.*?)\sby(.*?)$/, '$1');
                 //adapter.log.debug('getFirmwareVersion for ' + adapter.config.ip + "[" + options.port + '] parsed as: ' + version);
                 adapter.log.debug('Модель управляющего модуля Меги ' + IP + "[" + IPPort + '] распознана как: ' + controller_model);

                 if (version) {
                    //adapter.log.debug('getFirmwareVersion сохраняем: ' + version);

                    adapter.setState( 'firmware.version', {val: version, ack: true});
                    adapter.log.debug('getFirmwareVersion сохранили fw_version: ' + version);

                    // Analyse answer and updates staties
                    adapter.log.debug('getFirmwareVersion Актуальная версия прошивки: ' + fw_version_actual);
                    //adapter.setState( 'fw_version_last_known', {val: fw_version_actual, ack: true});
                    adapter.setState( 'firmware.last_known_version', {val: fw_version_actual, ack: true});

                    if ( version === fw_version_actual ) {
                          //adapter.setState( 'is_firmware_actual', {val: true, ack: true});
                          adapter.setState( 'firmware.is_actual', {val: true, ack: true});
                          adapter.log.debug('getFirmwareVersion Текущая версия актуальна');
                    } else {
                          //adapter.setState( 'is_firmware_actual', {val: false, ack: true});
                          adapter.setState( 'firmware.is_actual', {val: false, ack: true});
                          adapter.log.warn('getFirmwareVersion Текущая версия неактуальна');
                    }
                    
                    //adapter.createState( 'xp1');
                    //adapter.createState( 'xp2');

                 } else {
                    adapter.log.debug('getFirmwareVersion НЕ ПОПАЛИ: ' + version);
                 }

                 if (controller_model) {
                    //adapter.setState( 'version.controller_model', {val: controller_model, ack: true});
                    adapter.setState( 'controller.model', {val: controller_model, ack: true});
                 } else {
                    adapter.log.warn('Не смогли определить модель управляющего контроллера Меги');
                 }


              } 

          });
       }).on('error', function (e) {
          adapter.log.warn('Got error by getFirmwareVersion request ' + e.message);
       });
    }
}


// Функция перепрошивки Меги ---------------------------------------------------------------
function updateFirmware( message ) {
   //var parts = adapter.config.ip.split(':');
   //var ip = parts[0];
   //var pass = adapter.config.password;
   var cmd = '';
   var cmd1 = '';
   var targetVersion = '';

   if (typeof message === 'string') {
       try {
            message = JSON.parse(message);
       } catch (err) {
            adapter.log.error('Cannot parse: ' + message);
            return;
       }
   }


   if (message.targetVersion) {
      adapter.log.debug('Получен желаемый номер версии прошивки '+message.targetVersion);
      targetVersion = message.targetVersion || fw_version_actual;
   } else {
      adapter.log.debug('Не получен желаемый номер версии прошивки');
      targetVersion = fw_version_actual;
   }

   var dir ='';
   adapter.log.info('Вызвана функция перепрошивки Меги ip=' + IP +' до версии '+targetVersion);
   if ( !IP ) {
      adapter.log.warn('Не передан IP-адрес Меги. Перепрошивка отменена.');
      return;
   }
   if ( !Password ) {
      adapter.log.warn('Не передан пароль Меги. Перепрошивка отменена.');
      return;
   }
   dir = adapter.adapterDir;
   if ( !dir ) {
      adapter.log.warn('Не удалось определить каталог адаптера. Перепрошивка отменена.');
      return;
   }
   dir = dir + '/firmware';

   if (targetVersion === 'bootloader') {
      cmd = 'chmod 777 megad-cfg-2561.php|php ./megad-cfg-2561.php --fw '+fw_version_actual+'.hex -f -e';
   } else if (targetVersion === 'site') {
      cmd = 'chmod 777 megad-cfg-2561.php|php ./megad-cfg-2561.php -p ' + Password +' --ip '+ IP +' -w';
   } else if (targetVersion === 'site_ee') {
      cmd = 'chmod 777 megad-cfg-2561.php|php ./megad-cfg-2561.php -p ' + Password +' --ip '+ IP +' -w --ee';
   } else if (targetVersion === 'sitebeta') {
      cmd = 'chmod 777 megad-cfg-2561.php|php ./megad-cfg-2561.php -p ' + Password +' --ip '+ IP +' -w -b';
   } else if (targetVersion === 'sitebeta_ee') {
      cmd = 'chmod 777 megad-cfg-2561.php|php ./megad-cfg-2561.php -p ' + Password +' --ip '+ IP +' -w -b --ee';
   } else {
      cmd = 'chmod 777 megad-cfg-2561.php|php ./megad-cfg-2561.php --fw '+targetVersion+'.hex -p ' + Password +' --ee --ip '+ IP;
   }
   cmd1 = 'php ./megad-cfg-2561.php  --ip 192.168.0.14 --new-ip '+ IP +' -p sec'; // ???

   adapter.log.debug(cmd);
   
   var p=process.exec( cmd, 
          { cwd: dir  },
       function (error, stdout, stderr) {
        if (error) {
           adapter.log.error( error.code );
           adapter.log.error( error );
        }
        if ( stdout ) {
           adapter.log.info( stdout );
        }
        if ( stderr ) {
           adapter.log.error( stderr );
        }
        adapter.log.debug('Выполнили прошивку');
        if (targetVersion != 'bootloader') {
           adapter.log.debug('меняем ip-адрес Меги');
           adapter.log.debug(cmd1);

           var p1=process.exec( cmd1, 
                                { cwd: dir },
                                function (error, stdout, stderr) {
                                   if (error) {
                                      adapter.log.error( error.code );
                                      adapter.log.error( error );
                                   }
                                   if ( stdout ) {
                                      adapter.log.info( stdout );
                                   }
                                   if ( stderr ) {
                                      adapter.log.error( stderr );
                                   }
                                   adapter.log.debug('Выполнили прошивку');
                                   getFirmwareVersion();
                               });
        } else {
          getFirmwareVersion();
        }
   });
}
//---------------------------------------------------------------------------------------------------------
// разбираем файл настроек Меги и выставляем значения параметров
function parseMegaCfgLine ( line ) {
   var parts = [];
   var param = [];
   var state;
   var value;
   var pn;
   var pty;
   var ecmd;
   var af;
   var eth;
   var naf;
   var misc;
   var d;
   var disp;
   var m;
   var nodeName;
   var name;
   var portXPNum;
   var port_number;
   var numXP;
   var defaultState;
   var dSRV;
   var mSRV;
   var nr;
   var grp;
   var gsmf;
   var gsmf_text;
   var cf;
   var eip;
   var pwd;
   var gw;
   var sip;
   var sct;
   var pr;
   var gsm;
   var gsm_num;
   var smst;
   var srvt;
   var mdid;
   var sl;
   var fr;
   var pwmTimer = '';

   adapter.log.debug('Распознание строки настройки: '+line);
   parts = line.split('&');
   for (var i=0; i < parts.length; i++ ) {
      param = parts[i].split('=');
      state = param[0];
      value = param[1];
      if ( state == 'pn'   )    pn   = value || '';
      if ( state == 'pty'  )    pty  = value || cNPortType_NotConnected;
      if ( state == 'ecmd' )    ecmd = value || '';
      if ( state == 'af'   )    af   = value;
      if ( state == 'eth'  )    eth  = value || '';
      if ( state == 'naf'  )    naf  = value;
      if ( state == 'm'    )    m    = value || '0';
      if ( state == 'misc' )    misc = value;
      if ( state == 'd'    )    d    = value || '';
      if ( state == 'disp' )    disp = value || '';
      if ( state == 'nr'   )    nr   = value || '1'; // ?
      if ( state == 'grp'  )    grp  = value || '';
      if ( state == 'gsmf' )    gsmf = value || '0';
      if ( state == 'cf'   )    cf   = value || '';
      if ( state == 'eip'  )    eip  = value || '';
      if ( state == 'pwd'  )    pwd  = value || '';
      if ( state == 'gw'   )    gw   = value || '';
      if ( state == 'sip'  )    sip  = value || '';
      if ( state == 'sct'  )    sct  = value || '';
      if ( state == 'pr'   )    pr   = value || '';
      if ( state == 'gsm'  )    gsm  = value || '';
      if ( state == 'gsm_num')  gsm_num  = value || '';
      if ( state == 'smst' )    smst = value || '';
      if ( state == 'srvt' )    srvt = value || '';
      if ( state == 'mdid' )    mdid = value || '';
      if ( state == 'sl'   )    sl   = value || '';
      if ( state == 'fr'   )    fr   = value || '0';
   }

   if (!pn) {
      nodeName = adapter.namespace;
      if ( cf == '1' ) {
         //cf=1&eip=192.168.0.15&pwd=sec&gw=192.168.0.1&sip=192.168.1.35:91&sct=/0&pr=&gsm=1&gsm_num=79165499627&smst=3&srvt=0
         adapter.setState( nodeName + '.controller.ip', {val: eip, ack: true}); //??
         adapter.setState( nodeName + '.controller.password', {val: pwd, ack: true}); //??
         adapter.setState( nodeName + '.controller.gateway', {val: gw, ack: true}); 
         param = sip.split(':');
         state = param[0];
         value = param[1];
         adapter.setState( nodeName + '.controller.serverIP', {val: state, ack: true}); 
         adapter.setState( nodeName + '.controller.script', {val: sct, ack: true}); 
         adapter.setState( nodeName + '.controller.watchDogPort', {val: pr, ack: true}); 
         if (gsm == '1') {
            adapter.setState( nodeName + '.gsm.enabled', {val: true, ack: true}); 
            adapter.setState( nodeName + '.gsm.phone', {val: gsm_num, ack: true}); 
            adapter.setState( nodeName + '.gsm.timeout', {val: smst, ack: true}); 
         } else {
            adapter.setState( nodeName + '.gsm.enabled', {val: false, ack: true}); 
            adapter.setState( nodeName + '.gsm.phone', {val: '', ack: true}); 
            adapter.setState( nodeName + '.gsm.timeout', {val: smst, ack: true}); 
         }
         if (srvt == '1') {
            adapter.setState( nodeName + '.controller.serverType', {val: 'MQTT', ack: true}); 
         } else {
            adapter.setState( nodeName + '.controller.serverType', {val: 'HTTP', ack: true}); 
         }
      }

      if ( cf == '2' ) {
         //cf=2&mdid=5Q7g7&sl=1&nr=1
         adapter.setState( nodeName + '.controller.name', {val: mdid, ack: true}); 
         if (sl == '1') {
            adapter.setState( nodeName + '.controller.srvLoop', {val: true, ack: true}); 
         } else {
            adapter.setState( nodeName + '.controller.srvLoop', {val: false, ack: true}); 
         }
      }
      return; 
   }
   port_number = parseInt( pn, 10 );

   if ( port_number < 15 ) {
      numXP = 1;
   } else if ( port_number < 30 ) {
      numXP = 2;
   } else {
      numXP = 0; //?
   }

   if ((!af) || (af == 'ð=') || (af == 0) || (af == '0')) af = false;
   if ((!naf) || (naf == 'ð=') || (naf == 0) || (naf == '0')) naf = false;
   if ((!misc) || (misc == 'ð=') || (misc == 0) || (misc == '0')) misc = false;

   if ( gsmf == '0' ) {
      gsmf_text = cGSMmodeNo;
   } else if ( gsmf == '1'  ) {
      gsmf_text = cGSMmodeAlways;
   } else if ( gsmf == '2' ) {
      gsmf_text = cGSMmodeArmed;
   } else  {
      gsmf_text = cGSMmodeNo;
   }



/* здесь хорошо бы проверить на соответствие исполнительного модуля

   adapter.log.debug('pn = ' + pn );
   port_number = parseInt( pn, 10 );
   adapter.log.debug('port_number = ' + port_number );
   if ( port_number < 15 ) {
      portXPNum = port_number;
      numXP = '1';
   } else if ( port_number < 30 ) {
      portXPNum = port_number - 15;
      numXP = '2';
   } else {
      portXPNum = port_number;
      numXP = 'control';
   }
   adapter.log.debug('portXPNum = ' + portXPNum );
   adapter.log.debug('numXP = ' + numXP );
   if ( isPortTypeCorrect( portXPNum, numXP, pty ) ) {
   } else {
       pty = cNPortType_NotConnected

   isPortTypeCorrect ( portXPNum, numXP, portType ) 

*/


   nodeName = adapter.namespace + '.ports.' + pn;
   if ( pty == cNPortType_StandartIn ) {
      //pn=0&ecmd=7:2&af=&eth=&naf=&misc=&d=&pty=0&m=0&gsmf=0&nr=1
      adapter.log.debug('Настраиваем порт '+pn+' как стандартный вход');
      adapter.setState( nodeName + '.portType', {val: cPortType_StandartIn, ack: true});
      adapter.setState( nodeName + '.counter', {val: 0, ack: true}); //?
      adapter.setState( nodeName + '.currentState', {val: false, ack: true}); //?
      adapter.setState( nodeName + '.defaultAction', {val: ecmd, ack: true}); 
      adapter.setState( nodeName + '.defaultRunAlways', {val: af, ack: true}); 
      adapter.setState( nodeName + '.netAction', {val: eth, ack: true}); 
      adapter.setState( nodeName + '.netRunOnlyWhenServerOut', {val: naf, ack: true}); 
      adapter.setState( nodeName + '.send2ServerAlwaysPressRelease', {val: misc, ack: true}); 
      if ( m == cNPortMode_PressOnly ) adapter.setState( nodeName + '.portMode', {val: cPortMode_PressOnly, ack: true}); 
      else if ( m == cNPortMode_PressAndRelease ) adapter.setState( nodeName + '.portMode', {val: cPortMode_PressAndRelease, ack: true}); 
      else if ( m == cNPortMode_ReleaseOnly ) adapter.setState( nodeName + '.portMode', {val: cPortMode_ReleaseOnly, ack: true}); 
      else if ( m == cNPortMode_ClickMode ) { 
          adapter.setState( nodeName + '.portMode', {val: cPortMode_ClickMode, ack: true}); 
          adapter.setState( nodeName + '.send2ServerAlwaysPressRelease', {val: false, ack: true}); 
      }
      if ((!d) || (d == 'ð') || (d == 0) || (d == '0')) d = false;
      adapter.setState( nodeName + '.tremorDefenceDisabled', {val: d, ack: true}); 
      adapter.setState( nodeName + '.displayPort', {val: disp, ack: true}); 
      adapter.setState( nodeName + '.defaultState', {val: false, ack: true}); 
      adapter.setState( nodeName + '.digitalSensorType', {val: '', ack: true}); 
      adapter.setState( nodeName + '.temperature', {val: '', ack: true}); 
      adapter.setState( nodeName + '.humidity', {val: '', ack: true}); 
      adapter.setState( nodeName + '.digitalSensorMode', {val: '', ack: true}); 
      adapter.setState( nodeName + '.GSMmode', {val: gsmf_text, ack: true}); 
      adapter.setState( nodeName + '.portOutMode', {val: cOutPortMode_SW, ack: true}); 
      adapter.setState( nodeName + '.group', {val: '', ack: true}); 
      adapter.setState( nodeName + '.defaultPWM', {val: 0, ack: true}); 
      adapter.setState( nodeName + '.smooth', {val: false, ack: true}); 

   } else if ( pty == cNPortType_NotConnected ) {
/* ToDO: если порт переводим  в NC - хорошо бы его принудительно выключить xx:0 */
      adapter.log.debug('Настраиваем порт '+pn+' как неподключенный');
      adapter.setState( nodeName + '.portType', {val: cPortType_NotConnected, ack: true});
      adapter.setState( nodeName + '.counter', {val: 0, ack: true});
      adapter.setState( nodeName + '.currentState', {val: false, ack: true}); 
      adapter.setState( nodeName + '.room', {val: '', ack: true}); 
      adapter.setState( nodeName + '.func', {val: '', ack: true}); 
      adapter.setState( nodeName + '.defaultAction', {val: '', ack: true}); 
      adapter.setState( nodeName + '.defaultRunAlways', {val: false, ack: true}); 
      adapter.setState( nodeName + '.netAction', {val: '', ack: true}); 
      adapter.setState( nodeName + '.netRunOnlyWhenServerOut', {val: false, ack: true}); 
      adapter.setState( nodeName + '.portMode', {val: cPortMode_PressOnly, ack: true}); 
      adapter.setState( nodeName + '.send2ServerAlwaysPressRelease', {val: false, ack: true}); 
      adapter.setState( nodeName + '.tremorDefenceDisabled', {val: false, ack: true}); 
      adapter.setState( nodeName + '.displayPort', {val: '', ack: true}); 
      adapter.setState( nodeName + '.defaultState', {val: false, ack: true}); 
      adapter.setState( nodeName + '.digitalSensorType', {val: '', ack: true}); 
      adapter.setState( nodeName + '.temperature', {val: '', ack: true}); 
      adapter.setState( nodeName + '.humidity', {val: '', ack: true}); 
      adapter.setState( nodeName + '.digitalSensorMode', {val: '', ack: true}); 
      adapter.setState( nodeName + '.GSMmode', {val: cGSMmodeNo, ack: true}); 
      adapter.setState( nodeName + '.portOutMode', {val: cOutPortMode_SW, ack: true}); 
      adapter.setState( nodeName + '.group', {val: '', ack: true}); 
      adapter.setState( nodeName + '.defaultPWM', {val: 0, ack: true}); 
      adapter.setState( nodeName + '.smooth', {val: false, ack: true}); 

   } else if ( pty == cNPortType_Out )  {
// pn=7&grp=&pty=1&d=0&m=0&nr=1
      adapter.log.debug('Настраиваем порт '+pn+' как релейный выход');
      if ( ( m == 0 ) || ( m == 3 ) ) {
         name = adapter.namespace + '.controller.xp' + numXP + 'model';
         adapter.getState( name, function (err, state) {
            if ( state ) {
               if ( ( state.value == cXPModel7I7OSD ) || ( state.value == cXPModel8I7OS  ) || ( state.value == cXPModel8I7OSD ) ) { 
                  adapter.setState( nodeName + '.portType', {val: cPortType_SimistorOut, ack: true});
               } else {
                  adapter.setState( nodeName + '.portType', {val: cPortType_ReleOut, ack: true});
               }
            }
         });

      } else if ( m == 2 ) {
         adapter.setState( nodeName + '.portType', {val: cPortType_DS2413, ack: true});
      } else if ( m == 1 ) {
         adapter.setState( nodeName + '.portType', {val: cPortType_DimmedOut, ack: true});
      }
      adapter.setState( nodeName + '.counter', {val: 0, ack: true});
      adapter.setState( nodeName + '.currentState', {val: false, ack: true}); // ?? либо считать реальный
      adapter.setState( nodeName + '.defaultAction', {val: '', ack: true}); 
      adapter.setState( nodeName + '.defaultRunAlways', {val: false, ack: true}); 
      adapter.setState( nodeName + '.netAction', {val: '', ack: true}); 
      adapter.setState( nodeName + '.netRunOnlyWhenServerOut', {val: false, ack: true}); 
      adapter.setState( nodeName + '.portMode', {val: cPortMode_SW, ack: true}); 
      adapter.setState( nodeName + '.send2ServerAlwaysPressRelease', {val: false, ack: true}); 
      adapter.setState( nodeName + '.tremorDefenceDisabled', {val: false, ack: true}); 
      adapter.setState( nodeName + '.displayPort', {val: '', ack: true}); 
      adapter.setState( nodeName + '.digitalSensorType', {val: '', ack: true}); 
      adapter.setState( nodeName + '.temperature', {val: '', ack: true}); 
      adapter.setState( nodeName + '.humidity', {val: '', ack: true}); 
      adapter.setState( nodeName + '.digitalSensorMode', {val: '', ack: true}); 
      if ( m == 0 ) {
         adapter.setState( nodeName + '.portOutMode', {val: cOutPortMode_SW, ack: true}); 
         adapter.setState( nodeName + '.defaultState', {val: d, ack: true}); 
         adapter.setState( nodeName + '.defaultPWM', {val: 0, ack: true}); 
         adapter.setState( nodeName + '.smooth', {val: false, ack: true}); 
      } else if ( m == 1 ) {
         adapter.setState( nodeName + '.defaultState', {val: false, ack: true}); 
         adapter.setState( nodeName + '.smooth', {val: smooth, ack: true}); 
         adapter.setState( nodeName + '.defaultPWM', {val: defPWM, ack: true}); 
         adapter.setState( nodeName + '.portOutMode', {val: cOutPortMode_PWM, ack: true}); 
         if ( pn == '10' || pn == '12' || pn == '13' ) {
            pwmTimer = '1';
         } else if ( pn == '25' || pn == '27' || pn == '28' ) {
            pwmTimer = '3';
         } else if ( pn == '11' ) {
            pwmTimer = '2';
         } else { 
            // TRAP!
            pwmTimer = '1';
         }

         if ( fr == '0' ) {
            adapter.setState( nodeName + '.PWM.timers.' + pwmTimer + '.freq' , {val: cPWM_Freq_Normal, ack: true}); 
         } else if ( fr == '1' ) {
            adapter.setState( nodeName + '.PWM.timers.' + pwmTimer + '.freq' , {val: cPWM_Freq_Low, ack: true}); 
         } else if ( fr == '2' ) {
            adapter.setState( nodeName + '.PWM.timers.' + pwmTimer + '.freq' , {val: cPWM_Freq_High, ack: true}); 
         } else {
            // TRAP !
            adapter.setState( nodeName + '.PWM.timers.' + pwmTimer + '.freq' , {val: cPWM_Freq_Normal, ack: true}); 
         }

      } else if ( m == 2 ) {
         adapter.setState( nodeName + '.portOutMode', {val: cOutPortMode_DS2413, ack: true}); 
         adapter.setState( nodeName + '.defaultPWM', {val: 0, ack: true}); 
         adapter.setState( nodeName + '.defaultState', {val: d, ack: true}); 
         adapter.setState( nodeName + '.smooth', {val: false, ack: true}); 
      } else if ( m == 3 ) {
         adapter.setState( nodeName + '.portOutMode', {val: cOutPortMode_SWLINK, ack: true}); 
         adapter.setState( nodeName + '.defaultPWM', {val: 0, ack: true}); 
         adapter.setState( nodeName + '.defaultState', {val: d, ack: true}); 
         adapter.setState( nodeName + '.smooth', {val: false, ack: true}); 
      }
      adapter.setState( nodeName + '.group', {val: grp, ack: true}); 

   } else if ( pty == cNPortType_DigitalSensor ) {
      // pn=27&misc=0.00&hst=0.00&ecmd=&af=&eth=&naf=&pty=3&m=0&d=3&gsmf=0&nr=1
      adapter.log.debug('Настраиваем порт '+pn+' как цифровой вход');
      adapter.setState( nodeName + '.portType', {val: cPortType_DigitalSensor, ack: true});
      adapter.setState( nodeName + '.counter', {val: 0, ack: true});
      adapter.setState( nodeName + '.currentState', {val: '', ack: true}); // ?? либо считать реальный
      adapter.setState( nodeName + '.defaultAction', {val: '', ack: true}); 
      adapter.setState( nodeName + '.defaultRunAlways', {val: false, ack: true}); 
      adapter.setState( nodeName + '.netAction', {val: '', ack: true}); 
      adapter.setState( nodeName + '.netRunOnlyWhenServerOut', {val: false, ack: true}); 
      adapter.setState( nodeName + '.portMode', {val: cPortMode_SW, ack: true}); 
      adapter.setState( nodeName + '.send2ServerAlwaysPressRelease', {val: false, ack: true}); 
      adapter.setState( nodeName + '.tremorDefenceDisabled', {val: false, ack: true}); 
      adapter.setState( nodeName + '.displayPort', {val: '', ack: true}); 
      adapter.setState( nodeName + '.defaultState', {val: false, ack: true}); 
      adapter.setState( nodeName + '.defaultPWM', {val: 0, ack: true}); 
      adapter.setState( nodeName + '.smooth', {val: false, ack: true}); 
      if ( d == cNDigitalSensorTypeDS18B20 ) {
         dSRV = cDigitalSensorTypeDS18B20;
      } else if ( d == cNDigitalSensorTypeDHT11 ) {
         dSRV = cDigitalSensorTypeDHT11;
      } else if ( d == cNDigitalSensorTypeDHT22 ) {
         dSRV = cDigitalSensorTypeDHT22;
      } else if ( d == cNDigitalSensorTypeMarine ) {
         dSRV = cDigitalSensorTypeMarine;
      } else if ( d == cNDigitalSensorType1WBus ) {
         dSRV = cDigitalSensorType1WBus;
      } else if ( d == cNDigitalSensorTypeWiegand26 ) {
         dSRV = cDigitalSensorTypeWiegand26;
      }
      adapter.setState( nodeName + '.digitalSensorType', {val: dSRV, ack: true}); 
      adapter.setState( nodeName + '.temperature', {val: '', ack: true}); 
      adapter.setState( nodeName + '.humidity', {val: '', ack: true}); 
      if ( m == 0 ) {
         mSRV = 'Norm';
      } else if ( m == 1 ) {
         mSRV = '>';
      } else if ( m == 2 ) {
         mSRV = '<';
      } else if ( m == 3 ) {
         mSRV = '<>';
      }
      adapter.setState( nodeName + '.digitalSensorMode', {val: mSRV, ack: true}); 
      adapter.setState( nodeName + '.portOutMode', {val: cOutPortMode_SW, ack: true}); 
      adapter.setState( nodeName + '.group', {val: '', ack: true}); 


   } else /*if ( pty == cNPortType_NotConnected )*/ {
// остальные типы портов пока не реализованы, пишем их как неподключенные
/* ToDO: если порт переводим  в NC - хорошо бы его принудительно выключить xx:0 */
      adapter.log.debug('Настраиваем порт '+pn+' как неподключенный');
      adapter.setState( nodeName + '.portType', {val: cPortType_NotConnected, ack: true});
      adapter.setState( nodeName + '.counter', {val: 0, ack: true});
      adapter.setState( nodeName + '.currentState', {val: false, ack: true}); 
      adapter.setState( nodeName + '.room', {val: '', ack: true}); 
      adapter.setState( nodeName + '.func', {val: '', ack: true}); 
      adapter.setState( nodeName + '.defaultAction', {val: '', ack: true}); 
      adapter.setState( nodeName + '.defaultRunAlways', {val: false, ack: true}); 
      adapter.setState( nodeName + '.netAction', {val: '', ack: true}); 
      adapter.setState( nodeName + '.netRunOnlyWhenServerOut', {val: false, ack: true}); 
      adapter.setState( nodeName + '.portMode', {val: cPortMode_PressOnly, ack: true}); 
      adapter.setState( nodeName + '.send2ServerAlwaysPressRelease', {val: false, ack: true}); 
      adapter.setState( nodeName + '.tremorDefenceDisabled', {val: false, ack: true}); 
      adapter.setState( nodeName + '.displayPort', {val: '', ack: true}); 
      adapter.setState( nodeName + '.defaultState', {val: false, ack: true}); 
      adapter.setState( nodeName + '.digitalSensorType', {val: '', ack: true}); 
      adapter.setState( nodeName + '.temperature', {val: '', ack: true}); 
      adapter.setState( nodeName + '.humidity', {val: '', ack: true}); 
      adapter.setState( nodeName + '.digitalSensorMode', {val: '', ack: true}); 
      adapter.setState( nodeName + '.GSMmode', {val: cGSMmodeNo, ack: true}); 
      adapter.setState( nodeName + '.portOutMode', {val: cOutPortMode_SW, ack: true}); 
      adapter.setState( nodeName + '.group', {val: '', ack: true}); 
      adapter.setState( nodeName + '.defaultPWM', {val: 0, ack: true}); 
      adapter.setState( nodeName + '.smooth', {val: false, ack: true}); 
  }



/*   

var cNPortType_Out = 1;           
var cNPortType_DigitalSensor  = 3;
var cNPortType_I2C  = 4;
var cNPortType_AnalogSensor  = 2; 

var cPortType_DimmedOut = 'DimmedOut'; //1
var cPortType_SimistorOut = 'SimistorOut'; //1
var cPortType_DigitalSensor  = 'DigitalSensor'; //3 цифровой вход dsen
var cPortType_I2C  = 'I2C'; // 4 
var cPortType_AnalogSensor  = 'AnalogSensor'; // 2 АЦП-вход для аналоговых датчиков
*/

   
}
//--------------------------------------------------------------------------------------------------------
//Считывание настроек Меги из файла
function ReadFileMegaConfig( filename, callback ) {
   var dir = adapter.adapterDir;
   if ( !dir ) {
      adapter.log.warn('Не удалось определить каталог адаптера. Перепрошивка отменена.');
      return;
   } else {
      adapter.log.debug('Каталог адаптера: '+ dir );
   }

   adapter.log.debug('adapter.instance: '+ adapter.instance );

   adapter.log.debug('считываем настройки Меги из файла '+adapter.namespace +' -- '+dir + '/firmware/' + adapter.instance + '_' + filename);

   fs.readFile ( dir + '/firmware/'+adapter.instance + '_' + filename, { encoding : 'utf8' }, function(error, data) {
           if (error) adapter.log.error( 'Error:' + error );
           adapter.log.debug( 'Data:' + data );
           data.split('\n').forEach( line => {
              parseMegaCfgLine ( line );
           });
           if (callback) callback( error, data );
     }
   ); 
}


// Функция считывания настроек Меги в файл ---------------------------------------------------------------
function readMegaConfig2File( filename, callback ) {
   var cmd = '';
   var filename0 = filename || 'last.cfg';
   var filename1 = adapter.instance + '_' + filename0;
   var CBerror = '';
   var dir ='';

   adapter.log.info('Считываем настройки Меги ip=' + IP );
   if ( !IP ) {
      CBerror = 'Не передан IP-адрес Меги. Считывание настроек отменено.';
      adapter.log.error(CBerror);
      if (callback) callback( CBerror );
      return;
   }
   if ( !Password ) {
      CBerror = 'Не передан пароль Меги. Считывание настроек отменено.';
      adapter.log.error( CBerror );
      if (callback) callback( CBerror );
      return;
   }
   dir = adapter.adapterDir;
   if ( !dir ) {
      CBerror = 'Не удалось определить каталог адаптера.';
      adapter.log.error( CBerror );
      if (callback) callback( CBerror );
      return;
   }
   dir = dir + '/firmware';

   adapter.log.debug('Каталог конфига: '+dir +' Файл: ' + filename1 );

   cmd = 'chmod 777 megad-cfg-2561.php|php ./megad-cfg-2561.php --ip '+ IP +' --read-conf '+filename1+' -p '+ Password;

   adapter.log.debug(cmd);
   
   var p=process.exec( cmd, 
          { cwd: dir  },
       function (error, stdout, stderr) {
        if (error) {
           adapter.log.error( error.code );
           adapter.log.error( error );
           CBerror = error;
        }
        if ( stdout ) {
           adapter.log.info( stdout );
        }
        if ( stderr ) {
           adapter.log.error( stderr );
        }
        adapter.log.info('Настройки Меги считаны в файл ' + filename1 );
        // ReadFileMegaConfig( filename0 ); // имя файла передаем без номера инстанции
        if (callback) { 
           callback( CBerror );
        }
   });
}


//------------------------------------------------------------------------------------------------------
function processMessages(ignore) {
    adapter.getMessage(function (err, obj) {
        if (obj) {
            if (!ignore && obj && obj.command == 'send') processMessage(obj.message);
            processMessages();
        }
    });
}


//-------------------------------------------------------------------------------------------------------------------------
// Because the only one port is occupied by first instance, the changes to other devices will be send with messages
function processMessage(message) {
    var port;
    if (typeof message === 'string') {
        try {
            message = JSON.parse(message);
        } catch (err) {
            adapter.log.error('Cannot parse: ' + message);
            return;
        }
    }
    port = message.pt;

    // Command from instance with web server
    /*
    if (adapter.config.ports[port]) {
        // If digital port
        if (!adapter.config.ports[port].pty && adapter.config.ports[port].m != 1) {
            adapter.config.ports[port].value = !adapter.config.ports[port].m ? 1 : 0;
            processClick(port);
        } else if (adapter.config.ports[port].pty == 3 && adapter.config.ports[port].d == 4) {
            // process iButton
            adapter.setState(adapter.config.ports[port].id, message.val, true);
        } else {
            adapter.log.debug('reported new value for port ' + port + ', request actual value');
            // Get value from analog port
            getPortState(port, processPortState);
        }
    }
    */
}


//----------------------------------------------------------------------------------------------------------------------
function writeConfigOne(ip, pass, _settings, callback, port, errors) {
    if (port === undefined) {
        port = 0;
        errors = [];
    } else {
        port++;
    }
    var settings = _settings[port];
    if (!settings) {
        return callback(errors);
    }

    //var parts = ip.split(':');
    var options = {
        host: IP,
        port: IPPort,
        path: '/' + Password + '/?pn=' + port
    };

    //http://192.168.0.14/sec/?pn=1&pty=0...
    if (settings.ecmd === 'ð=') settings.ecmd = '';

    settings.pty = parseInt(settings.pty, 10) || 0;

    // Input
    if (!settings.pty) {
        settings.d    = parseInt(settings.d, 10) || 0;
        settings.ecmd = settings.ecmd || '';
        settings.eth  = settings.eth  || '';
        ///options.path += '&pty=0&m=' + (settings.m || 0) + '&misc=1&d=' + settings.d + '&ecmd=' + encodeURIComponent((settings.ecmd || '').trim()) + '&eth=';
        options.path += '&pty=0&m=' + (settings.m || 0) + '&ecmd=' + encodeURIComponent((settings.ecmd || '').trim()) + '&eth=' + encodeURIComponent((settings.eth || '').trim());
        if (settings.af == 1) {
            options.path += '&af=1';
        }
        if (settings.naf == 1) {
            options.path += '&naf=1';
        }
        if (settings.misc == 1) {
            options.path += '&misc=1';
        }
        if (settings.d == 1) {
            options.path += '&d=' + settings.d;
        }
    } else
    if (settings.pty == 1) {
        ///settings.pwm = parseInt(settings.pwm, 10) || 0;
        ///if (settings.pwm > 255) settings.pwm = 255;
        ///if (settings.pwm < 0)   settings.pwm = 0;
	settings.d = parseInt(settings.d, 10) || 0;
        if (settings.d > 255) settings.d = 255;
        if (settings.d < 0)   settings.d = 0;

        // digital out
        ///options.path += '&pty=1&m=' + (settings.m || 0) + '&d=' + (settings.d || 0) + '&pwm=' + (settings.pwm || 0);
	options.path += '&pty=1&m=' + (settings.m || 0) + '&d=' + (settings.d || 0);
        if (settings.m == 1 && settings.misc == 1) {
            options.path += '&misc=1' + '&m2=' + (settings.m2 || 0);
        }
    } else
    if (settings.pty == 2) {
        // Convert misc with given factor and offset
        settings.factor = parseFloat(settings.factor || 1) || 1;
        settings.offset = parseFloat(settings.offset || 0) || 0;
        settings.misc = Math.round(((parseFloat(settings.misc) || 0) - settings.offset) / settings.factor);

        if (settings.misc > 1023) settings.misc = 1023;
        if (settings.misc < 0)    settings.misc = 0;

        // ADC
        settings.ecmd = settings.ecmd || '';
        settings.eth  = settings.eth  || '';
        ///options.path += (((port == 14 || port == 15) && settings.pty == 2) ? '' : '&pty=2') + '&m=' + (settings.m || 0) + '&misc=' + (settings.misc || 0) + '&ecmd=' + encodeURIComponent((settings.ecmd || '').trim()) + '&eth=';
        options.path += '&pty=2' + '&m=' + (settings.m || 0) + '&misc=' + (settings.misc || 0) + '&hst=' + (settings.hst || 0) + '&ecmd=' + encodeURIComponent((settings.ecmd || '').trim()) + '&eth=' + encodeURIComponent((settings.eth || '').trim());
        if (settings.naf == 1) {
            options.path += '&naf=1';
        }
    } else
    if (settings.pty == 3) {
        settings.ecmd = settings.ecmd || '';
        settings.eth  = settings.eth  || '';
        // digital sensor
        options.path += '&pty=3&d=' + (settings.d || 0);
	if (settings.d == 3) {
            ///options.path += '&m=' + (settings.m || 0) + '&misc=' + (settings.misc || 0) + '&ecmd=' + encodeURIComponent((settings.ecmd || '').trim()) + '&eth=';
            options.path += '&m=' + (settings.m || 0) + '&misc=' + (settings.misc || 0) + '&hst=' + (settings.hst || 0) + '&ecmd=' + encodeURIComponent((settings.ecmd || '').trim()) + '&eth=' + encodeURIComponent((settings.eth || '').trim());
            if (settings.naf == 1) {
                options.path += '&naf=1';
            }
        }
    /*} else
    if (settings.pty == 4) {
        adapter.log.info('Do not configure internal temperature port ' + port);
        return writeConfigOne(ip, pass, _settings, callback, port, errors);*/
    } else {
        // NC
        options.path += '&pty=255';
    }

    // If internal temperature
    ///adapter.log.info('Write config for port ' + port + ': http://' + ip + options.path);

    http.get(options, function (res) {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function (chunk) {
            data += chunk;
        });
        res.on('end', function () {
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + data);
            } else {
                adapter.log.debug('Response: ' + data);
            }

            if (res.statusCode != 200) errors[port] = res.statusCode;

            setTimeout(function () {
                writeConfigOne(ip, pass, _settings, callback, port, errors);
            }, 1000);
        });
    }).on('error', function (err) {
        errors[port] = err;
        setTimeout(function () {
            writeConfigOne(ip, pass, _settings, callback, port, errors);
        }, 1000);
    });
}


//---------------------------------------------------------------------------------------------
function ipToBuffer(ip, buff, offset) {
    offset = ~~offset;

    var result;

    if (/^(\d{1,3}\.){3,3}\d{1,3}$/.test(ip)) {
        result = buff || new Buffer(offset + 4);
        ip.split(/\./g).map(function (byte) {
            result[offset++] = parseInt(byte, 10) & 0xff;
        });
    } else if (/^[a-f0-9:]+$/.test(ip)) {
        var s    = ip.split(/::/g, 2);
        var head = (s[0] || '').split(/:/g, 8);
        var tail = (s[1] || '').split(/:/g, 8);

        if (tail.length === 0) {
            // xxxx::
            while (head.length < 8) {
                head.push('0000');
            }
        } else if (head.length === 0) {
            // ::xxxx
            while (tail.length < 8) {
                tail.unshift('0000');
            }
        } else {
            // xxxx::xxxx
            while (head.length + tail.length < 8) {
                head.push('0000');
            }
        }

        result = buff || new Buffer(offset + 16);
        head.concat(tail).map(function (word) {
            word = parseInt(word, 16);
            result[offset++] = (word >> 8) & 0xff;
            result[offset++] = word & 0xff;
        });
    } else {
        throw Error('Invalid ip address: ' + ip);
    }

    return result;
}


//----------------------------------------------------------------------------------------------------------------
function ipToString(buff, offset, length) {
    var i;
    offset = ~~offset;
    length = length || (buff.length - offset);

    var result = [];
    if (length === 4) {
        // IPv4
        for (i = 0; i < length; i++) {
            result.push(buff[offset + i]);
        }
        result = result.join('.');
    } else if (length === 16) {
        // IPv6
        for (i = 0; i < length; i += 2) {
            result.push(buff.readUInt16BE(offset + i).toString(16));
        }
        result = result.join(':');
        result = result.replace(/(^|:)0(:0)*:0(:|$)/, '$1::$3');
        result = result.replace(/:{3,4}/, '::');
    }

    return result;
}

//-------------------------------------------------------------------------------------------------------------------
function ipMask(addr, mask) {
    var i;
    addr = ipToBuffer(addr);
    mask = ipToBuffer(mask);

    var result = new Buffer(Math.max(addr.length, mask.length));

    // Same protocol - do bitwise and
    if (addr.length === mask.length) {
        for (i = 0; i < addr.length; i++) {
            result[i] = addr[i] & mask[i];
        }
    } else if (mask.length === 4) {
        // IPv6 address and IPv4 mask
        // (Mask low bits)
        for (i = 0; i < mask.length; i++) {
            result[i] = addr[addr.length - 4  + i] & mask[i];
        }
    } else {
        // IPv6 mask and IPv4 addr
        for (i = 0; i < result.length - 6; i++) {
            result[i] = 0;
        }

        // ::ffff:ipv4
        result[10] = 0xff;
        result[11] = 0xff;
        for (i = 0; i < addr.length; i++) {
            result[i + 12] = addr[i] & mask[i + 12];
        }
    }

    return ipToString(result);
}

//-------------------------------------------------------------------------------------------------------------------
function findIp(ip) {
    var parts = ip.split(':');
    ip = parts[0];

    if (ip === 'localhost' || ip == '127.0.0.1') return '127.0.0.1';

    var interfaces = require('os').networkInterfaces();

    for (var k in interfaces) {
        for (var k2 in interfaces[k]) {
            var address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal && address.address) {

                // Detect default subnet mask
                var num = parseInt(address.address.split('.')[0], 10);
                var netMask;
                if (num >= 192) {
                    netMask = '255.255.255.0';
                } else
                if (num >= 128) {
                    netMask = '255.255.0.0';
                } else {
                    netMask = '255.0.0.0';
                }

                if (ipMask(address.address, netMask) == ipMask(ip, netMask)) {
                    return address.address;
                }
            }
        }
    }
    return null;
}

//--------------------------------------------------------------------------------------------------------
function writeConfigDevice(ip, pass, config, callback) {
    //pwd: пароль для доступа к Web-интерфейсу устройства (макс. 3 байт)
    //eip: IP-адрес устройства
    //sip: IP-адрес сервера
    //sct: скрипт, который вызывается на сервере в случаях, заданных пользователем (макс. 15 байт)

    //pr: Пресет. Значения: 0 - пресет не установлен, 1 - пресет для исполнительного модуля MegaD-7I7O
    //tc: Проверка значений встроенного температурного сенсора. Значения: 0 - не проверять, 1 - проверять
    //at: Значение температуры, при достижении которого в случае, если задана проверка встроенного температурного датчика, устройство будет отправлять сообщения на сервер
    //var parts = ip.split(':');
    var options = {
        host: IP,
        port: IPPort,
        path: '/' + Password + '/?cf=1'
    };

    if (config.eip !== undefined && config.eip != IP)   options.path += '&eip=' + config.eip;
    if (config.pwd !== undefined && config.pwd != Password) options.path += '&pwd=' + config.pwd;

    if (config.eip === undefined && config.pwd === undefined) {
        var sip = findIp(config.eip || IP);
        if (!sip) {
            return callback('Device with "' + IP + '" is not reachable from ioBroker.');
        }
        options.path += '&sip=' + sip + ( ServerPort ? ':' + ServerPort : '');
        options.path += '&sct=' + encodeURIComponent(adapter.instance + '/');
    }

    adapter.log.info('Write config for device: http://' + IP + options.path);

    http.get(options, function (res) {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function (chunk) {
            data += chunk;
        });
        res.on('end', function () {
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + data);
            } else {
                adapter.log.debug('Response: ' + data);
            }
            callback(null);
        });
    }).on('error', function (err) {
        callback(err.message);
    });
}

//-----------------------------------------------------------------------------------------------------------------
function writeConfig(obj) {
    var ip;
    var password;
    var _ports;
    var config;
    if (obj && obj.message && typeof obj.message == 'object') {
        ip       = obj.message.ip;
        password = obj.message.password;
        _ports   = obj.message.ports;
        config   = obj.message.config;
    } else {
        ip       = obj ? obj.message : '';
        password = Password;
        _ports   = adapter.config.ports;
        config   = adapter.config;
    }

    var errors = [];
    if (ip && ip != '0.0.0.0') {
        var running = false;
        if (_ports && _ports.length) {
            running = true;
            writeConfigOne(ip, password, _ports, function (err, port) {
                setTimeout(function () {
                    if (err) errors[port] = err;
                    if (config) {
                        writeConfigDevice(ip, password, config, function (err) {
                            if (err) errors[20] = err;
                            if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: errors}, obj.callback);
                        });
                    } else {
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: errors}, obj.callback);
                    }
                }, 1000);
            });
        } else if (config) {
            running = true;
            writeConfigDevice(ip, password, config, function (err) {
                if (err) errors[20] = err;
                if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: errors}, obj.callback);
            });
        }

        if (!running) {
            if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: 'no ports and no config'}, obj.callback);
        }
    } else {
        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: 'invalid address'}, obj.callback);
    }
}

//------------------------------------------------------------------------------------------------------------
function detectPortConfig(ip, pass, length, callback, port, result) {
    if (port === undefined) {
        port = 0;
        result = [];
    } else {
        port++;
        if (port >= length) {
            return callback(result);
        }
    }

    //var parts = ip.split(':');
    var options = {
        host: IP,
        port: IPPort,
        path: '/' + Password + '/?pt=' + port
    };

    adapter.log.info('read config from port: http://' + IP + options.path);

    http.get(options, function (res) {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function (chunk) {
            data += chunk;
        });

        res.on('end', function () {
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + data);
            } else {
                var settings = {};
                // Analyse answer
                var inputs = data.match(/<input [^>]+>/g);
                var i;

                if (inputs) {
                    for (i = 0; i < inputs.length; i++) {
                        var args = inputs[i].match(/(\w+)=([^<> ]+)/g);
                        if (args) {
                            var isettings = {};
                            for (var a = 0; a < args.length; a++) {
                                var parts = args[a].split('=');
                                isettings[parts[0]] = parts[1].replace(/^"/, '').replace(/"$/, '');
                            }

                            if (isettings.name) {
                                settings[isettings.name] = (isettings.value === undefined) ? '' : isettings.value;
                                if (isettings.type == 'checkbox' && inputs[i].indexOf('checked') == -1) {
                                    settings[isettings.name] = (!settings[isettings.name]) ? 1 : 0;
                                }
                            }
                        }
                    }
                }
                inputs = data.match(/<select .+?<\/select>/g);
                if (inputs) {
                    for (i = 0; i < inputs.length; i++) {
                        var name = inputs[i].match(/name=(\w+)/);
                        if (name) {
                            var vars = inputs[i].match(/<option value=(\d+) selected>/);
                            if (vars) {
                                settings[name[1]] = vars[1];
                            } else {
                                settings[name[1]] = 0;
                            }
                        }
                    }
                }

                if (settings.pty === undefined) {
                    if (data.indexOf('>Type In<') != -1) {
                        settings.pty = 0;
                    } else if (data.indexOf('>Type Out<') != -1) {
                        settings.pty = 1;
                    ///} else if (data.match(/<br>A\d+\//)) {
                        ///settings.pty = 2;
                    }
                } else {
                    settings.pty = parseInt(settings.pty, 10);
                }

                /*if (settings.pty == 1) {
                    settings.m   = settings.m   || 0;
                    settings.pwm = settings.pwm || 0;
                }*/
                if (settings.m    !== undefined) settings.m    = parseInt(settings.m,    10);
                if (settings.d    !== undefined) settings.d    = parseInt(settings.d,    10);
                ///if (settings.misc !== undefined) settings.misc = parseInt(settings.misc, 10);
                ///if (settings.pwm  !== undefined) settings.pwm  = parseInt(settings.pwm,  10);
                if (settings.pn   !== undefined) settings.pn   = parseInt(settings.pn,   10);
                if (settings.naf  !== undefined) settings.naf  = parseInt(settings.naf,  10);
		if (settings.fr   !== undefined) settings.fr   = parseInt(settings.fr,   10);
                if (settings.m2   !== undefined) settings.m2   = parseInt(settings.m2,   10);
                if (settings.ecmd === 'ð=')      settings.ecmd = '';

                result[port] = settings;
                adapter.log.debug('Response: ' + data);
            }
            detectPortConfig(ip, pass, length, callback, port, result);
        });
    }).on('error', function (err) {
        adapter.log.error(err.message);
        detectPortConfig(ip, pass, length, callback, port, result);
    });
}


// Получение конфигурации Меги из устройства -------------------------------------------------------------------------
function detectDeviceConfig(ip, pass, callback) {
    var filename = 'last.cfg';
    readMegaConfig2File( filename, function( error ) {
       if ( error ) {
          adapter.log.error( error );
          if ( callback ) callback( error, null );
       } else {
          ReadFileMegaConfig( filename, function( error, data ) {
             if ( error ) {
                adapter.log.error( error );
                if ( callback ) callback( error, null );
             } else {
                if ( callback ) callback( null, data );
             }
          });          
       }
    });
    return;
    //--------------------------
    /*
    var parts = ip.split(':');
    var options = {
        host: parts[0],
        port: parts[1] || 80,
        path: '/' + pass + '/?cf=1'
    };

    adapter.log.info('read config from port: http://' + ip + options.path);



    http.get(options, function (res) {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function (chunk) {
            data += chunk;
        });

        res.on('end', function () {
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + data);
            } else {
                // parse config
                // Analyse answer
                var inputs = data.match(/<input [^>]+>/g);
                var i;
                var settings = {};

                if (inputs) {
                    for (i = 0; i < inputs.length; i++) {
                        var args = inputs[i].match(/(\w+)=([^<> ]+)/g);
                        if (args) {
                            var isettings = {};
                            for (var a = 0; a < args.length; a++) {
                                var parts = args[a].split('=');
                                isettings[parts[0]] = parts[1].replace(/^"/, '').replace(/"$/, '');
                            }

                            if (isettings.name) {
                                settings[isettings.name] = (isettings.value === undefined) ? '' : isettings.value;
                                if (isettings.type == 'checkbox' && inputs[i].indexOf('checked') == -1) {
                                    settings[isettings.name] = (!settings[isettings.name]) ? 1 : 0;
                                }
                            }
                        }
                    }
                }
                inputs = data.match(/<select .+?<\/select>/g);
                if (inputs) {
                    for (i = 0; i < inputs.length; i++) {
                        var name = inputs[i].match(/name=(\w+)/);
                        if (name) {
                            var vars = inputs[i].match(/<option value=(\d+) selected>/);
                            if (vars) {
                                settings[name[1]] = vars[1];
                            } else {
                                settings[name[1]] = 0;
                            }
                        }
                    }
                }
                callback(null, settings);
            }
        });
    }).on('error', function (err) {
        adapter.log.error(err.message);
        callback(err);
    });
    //-------------------------------------------------------
    readMegaConfig2File( 'last.cfg' );
    */
    //ReadFileMegaConfig( 'last.cfg' ); // ?

}



//------------------------------------------------------------------------------------------------------------------
/*
// Message is IP address
function detectPorts(obj) {
    var ip;
    var password;
    if (obj && obj.message && typeof obj.message == 'object') {
        ip       = obj.message.ip;
        password = obj.message.password;
    } else {
        ip       = obj ? obj.message : '';
        password = adapter.config.password;
    }
    if (ip && ip != '0.0.0.0') {
        getPortsState(ip, password, function (err, response) {
            if (err || !response) {
                if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: err, response: response}, obj.callback);
                return;
            }
            var parts  = response.split(';');
            detectPortConfig(ip, password, parts.length, function (result) {
                detectDeviceConfig(ip, password, function (error, devConfig) {
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: err, response: response, ports: result, config: devConfig}, obj.callback);
                });
            });
        });
    } else {
        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: 'invalid address'}, obj.callback);
    }
}
*/

//---------------------------------------------------------------------------------------------------------------
function discoverMegaOnIP(ip, callback) {
    var nums = ip.split('.');
    nums[3] = 255;
    ip = nums.join('.');

    var dgram = require('dgram');
    var message = new Buffer([0xAA, 0, 12]);
    var client = dgram.createSocket('udp4');
    client.on('error', function (err) {
        adapter.log.error(err);
    });

    client.bind(42000, function () {
        client.setBroadcast(true);
    });

    client.on('message', function (msg, rinfo) {
        if (msg[0] == 0xAA) {
            result.push(rinfo.address);
        }

        console.log('Received %d bytes from %s:%d\n',
            msg.length, rinfo.address, rinfo.port);
    });
    client.send(message, 0, message.length, 52000, ip, function (err) {
        console.log('Discover sent to ' + ip);
    });
    var result = [];

    setTimeout(function () {
        client.close();
        callback(result);
    }, 2000);

}

//--------------------------------------------------------------------------------------------------
function discoverMega(obj) {
    var interfaces = require('os').networkInterfaces();
    var result = [];
    var count  = 0;
    for (var k in interfaces) {
        for (var k2 in interfaces[k]) {
            var address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal && address.address) {
                count++;
                discoverMegaOnIP(address.address, function (_result) {
                    if (_result && _result.length) {
                        for (var i = 0; i < _result.length; i++) {
                            result.push(_result[i]);
                        }
                    }
                    if (!--count) {
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: null, devices: result}, obj.callback);
                    }
                });
            }
        }
    }

    if (!count && obj.callback) adapter.sendTo(obj.from, obj.command, {error: null, devices: []}, obj.callback);
}

//--------------------------------------------------------------------------------------------------------------------
// Get State of ONE port
function getPortState(port, callback) {
    //var parts = adapter.config.ip.split(':');

    var options = {
        host: IP,
        port: IPPort,
        path: '/' + Password + '/?pt=' + port + '&cmd=get'
    };
    adapter.log.debug('getPortState http://' + IP + options.path);

    http.get(options, function (res) {
        var xmldata = '';
        res.on('error', function (e) {
            adapter.log.warn('megaD: ' + e);
        });
        res.on('data', function (chunk) {

            xmldata += chunk;
        });
        res.on('end', function () {
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + xmldata);
            }
            adapter.log.debug('response for ' + IP + "[" + port + ']: ' + xmldata);
            // Analyse answer and updates staties
            if (callback) callback(port, xmldata);
        });
    }).on('error', function (e) {
        adapter.log.warn('Got error by request ' + e.message);
    });
}

//------------------------------------------------------------------------------------------------------------
function getPortStateW(ip, password, port, callback) {                  // 1Wire
    //http://192.168.1.14/sec/?pt=33&cmd=list
    if (typeof ip == 'function') {
        callback = ip;
        ip = null;
    }
    if (typeof password == 'function') {
        callback = password;
        password = null;
    }
    password = (password === undefined || password === null) ? Password : password;
    ip       =  ip || IP;
    
    var parts = ip.split(':');

    var options = {
	host: IP,
        port: IPPort,
        path: '/' + Password + '/?pt=' + port + '&cmd=list'
    };

    adapter.log.debug('getPortStateW http://' + IP + options.path);

    http.get(options, function (res) {
        var xmldata = '';
        res.on('error', function (e) {
	    adapter.log.warn(e);
        });
        res.on('data', function (chunk) {
            xmldata += chunk;
        });
        res.on('end', function () {
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + xmldata);
                //if (callback) callback(xmldata);
            } else {
                adapter.log.debug('Response for ' + IP + "[" + port + ']: ' + xmldata);
                // Analyse answer and updates statuses
		//if (callback) callback(null, xmldata);
                if (callback) callback(port, xmldata);
            }

        });
    }).on('error', function (e) {
        adapter.log.warn('Got error by request to ' + IP + ': ' + e.message);
        callback(e.message);
    });
}    

//---------------------------------------------------------------------------------------------------------
// Получение данных о состоянии ВСЕХ портов (?cmd=all)
function getPortsState(ip, password, callback) {
    if (typeof ip == 'function') {
        callback = ip;
        ip = null;
    }
    if (typeof password == 'function') {
        callback = password;
        password = null;
    }
    password = (password === undefined || password === null) ? Password : password;
    ip       =  ip || IP;

    var parts = ip.split(':');

    var options = {
        host: IP,
        port: IPPort,
        path: '/' + Password + '/?cmd=all'
    };

    adapter.log.debug('getPortsState http://' + IP + options.path);

    http.get(options, function (res) {
        var xmldata = '';
        res.on('error', function (e) {
            adapter.log.warn(e);
        });
        res.on('data', function (chunk) {
            xmldata += chunk;
        });
        res.on('end', function () {
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + xmldata);
                if (callback) callback(xmldata);
            } else {
                adapter.log.debug('Response for ' + IP + '[all]: ' + xmldata);
                // Analyse answer and updates statuses
                if (callback) callback(null, xmldata);
            }

        });
    }).on('error', function (e) {
        adapter.log.warn('Got error by request to ' + IP + ': ' + e.message);
        callback(e.message);
    });
}


//------------------------------------------------------------------------------------------------------------------
function processClick(port) {
    var config = adapter.config.ports[port];

    // If press_long
    ///if (config.m == 1 && config.long) {
    if ((config.m == 1 || config.misc == 1) && config.long) {	
        // Detect EDGE
        if (config.oldValue !== undefined && config.oldValue !== null && config.oldValue != config.value) {
            adapter.log.debug('new state detected on port [' + port + ']: ' + config.value);

            // If pressed
            if (config.value) {
                // If no timer running
                if (!config.longTimer) {
                    adapter.log.debug('start long click detection on [' + port + ']: ' + config.value);
                    // Try to detect long click
                    config.longTimer = setTimeout(function () {
                        config.longTimer = null;
                        config.longDone  = true;

                        adapter.log.debug('Generate LONG press on port ' + port);

                        adapter.setState(config.id + '_long', true, true);

                    }, adapter.config.longPress);
                } else {
                    adapter.log.warn('long timer runs, but state change happens on [' + port + ']: ' + config.value);
                }
            } else {
                // If released
                // If timer for double running => stop it
                if (config.longTimer) {
                    adapter.log.debug('stop long click detection on [' + port + ']: ' + config.value);
                    clearTimeout(config.longTimer);
                    config.longTimer = null;
                }

                // If long click generated => clear flag and do nothing, elsewise generate normal click
                if (!config.longDone) {
                    adapter.log.debug('detected short click on port [' + port + ']: ' + config.value);

                    if (config.double && adapter.config.doublePress) {
                        detectDoubleClick(port);
                    } else {
                        adapter.setState(config.id, true, true);
                        // Set automatically the state of the port to false after 100ms
                        setTimeout(function () {
                            adapter.setState(config.id, false, true);
                        }, 100);
                    }
                } else {
                    // Set to false
                    adapter.log.debug('Remove LONG press on port ' + port);
                    adapter.setState(config.id + '_long', false, true);

                    adapter.log.debug('clear the double click flag on port [' + port + ']: ' + config.value);
                    config.longDone = false;
                }
            }
        } else {
            adapter.log.debug('ignore state on port [' + port + ']: ' + config.value + ' (because the same)');
        }
    } else {
        adapter.log.debug('detected new state on port [' + port + ']: ' + config.value);
        triggerShortPress(port);
    }
}

//-------------------------------------------------------------------------------------------------------------------
function detectDoubleClick(port) {
    var config = adapter.config.ports[port];

    if (config.double && adapter.config.doublePress) {

        if (config.doubleTimer) {
            clearTimeout(config.doubleTimer);
            config.doubleTimer = null;
            adapter.log.debug('Generate double click on port ' + port);
            // Generate double click
            adapter.setState(config.id + '_double', true, true);

            // Set automatically the state of the port to false after 100ms
            setTimeout(function () {
                adapter.setState(config.id + '_double', false, true);
            }, 100);

        } else {

            adapter.log.debug('Start timer for ' + adapter.config.doublePress + 'ms to detect double click on ' + port);

            config.doubleTimer = setTimeout(function () {
                adapter.log.debug('Generate short click on port ' + port);
                // Generate single click
                config.doubleTimer = null;
                adapter.setState(config.id, true, true);
                // Set automatically the state of the port to false after 100ms
                setTimeout(function () {
                    adapter.setState(config.id, false, true);
                }, 100);
            }, adapter.config.doublePress);

        }
    }
}

//-------------------------------------------------------------------------------------------------------------
function triggerShortPress(port) {
    var config = adapter.config.ports[port];

    if (config.double && adapter.config.doublePress) {
        // if not first read
        if (config.oldValue === undefined || config.oldValue === null) return;

        if (!config.value) {
            adapter.setState(config.id, false, true);
             return;
        }

        detectDoubleClick(port);
    } else {
        ///if (config.m != 1) {
	if (config.misc != 1) {
            // if not first read
            if (config.oldValue === undefined || config.oldValue === null) return;
            adapter.log.debug('reported new state for port ' + port + ' - true');

            adapter.setState(config.id, true, true);

            // Set automatically the state of the port to false after 100ms
            setTimeout(function () {
                adapter.log.debug('set state for port ' + port + ' back to false');
                config.value = 0;
                adapter.setState(config.id, false, true);
            }, 100);
        } else {
            adapter.setState(config.id, !!config.value, true);
        }
    }
}



//----------------------------------------------------------------------------
/*function checkDisplay() {
   /
   adapter.getStates('*', function(err,states) {
      x = JSON.stringify(states); 

      adapter.log.debug('states = '+ x );
      elist = JSON.parse( x ); 
      var z = elist["megadjt.0.ports.0.room"];
   /

   for (var m = 0; m <= 37 ; m++) {
      var inst = 'ports.' + m + '.portType';
      adapter.getState( inst, function(err,state) {
         var portType = state.val;


   IsDisplayPresented = false; // пока ориентируемся на тип порта I2C, в будущем поправить на конкретный девайс
   for (var m = 0; m <= 37 ; m++) {
      if (Setup[ inst + '.ports.'+ m + '.portType' ] == cPortType_I2C ) {
         IsDisplayPresented = true;
      }
   }
}
*/

//------------------------------------------------------------------------------------------------------------------
function processPortState(_port, value) {
    var q = 0;
    var portBranch         = 'ports.' + _port + '.';
    var currentStateBranch = portBranch + 'currentState';
    var portTypeBranch     = portBranch + 'portType';
    var counterBranch      = portBranch + 'counter';
    var temperatureBranch  = portBranch + 'temperature';
    var humidityBranch     = portBranch + 'humidity';

    //adapter.log.debug( 'portTypeBranch='+portTypeBranch );
    //adapter.log.debug( 'temperatureBranch='+temperatureBranch );
    //adapter.log.debug( 'value='+value );

    adapter.getState( portTypeBranch, function(err,state) {
       var portType = state.val;
       //adapter.log.debug( 'portType[' + _port + '] ='+portType );

       if (!portType) {
          adapter.log.warn('Неизвестный порт: ' + _port );
          return;
       } 

       if ( portType == cPortType_NotConnected ) {
          return;
       }

       adapter.getState( currentStateBranch, function(err,state) {
          var oldState = state.val;
          //adapter.log.debug( '+value='+value );
          //adapter.log.debug( 'oldState='+oldState );

          if ( value !== null ) {
             var secondary   = null;
             var new_counter = null;
             var temperature = null;
             var humidity    = null;
             var f;
             // Value can be OFF/5 or 27/0 or 27 or ON  or DS2413 ON/OFF 
             // Value can be 30c5b8000000:27.50;32c5b8000000:28.81;31c5b8000000:27.43.......

             if (typeof value == 'string') {
                var match_slash = value.split('/');  //t
                //adapter.log.debug( 'match_slash='+match_slash );
                var match_temp  = value.match(/temp:([0-9.-]+)/); //m
                //adapter.log.debug( 'match_temp='+match_temp );
                if (match_temp) {
                   humidity = value.match(/hum:([0-9.]+)/);
                   if (humidity) humidity = parseFloat(humidity[1]);
                   //adapter.log.debug( 'match_temp[0]='+match_temp[0] );
                   //adapter.log.debug( 'match_temp[1]='+match_temp[1] );
                   temperature = match_temp[1];
                   //adapter.log.debug( 'temperature='+temperature );
                } else {
                   value = match_slash[0];
                }
                if (match_slash[1] !== undefined && humidity === null) { // counter
                   new_counter = parseInt(match_slash[1], 10);
                }
                if (match_slash[1] == 'OFF') {  // DS2413
                   secondary = 0;
                } else if (match_slash[1] == 'ON') {
                   secondary = 1;
                } else if (match_slash[1] == 'NA') {
                   secondary = 0;
                   q = 0x82; // DS2413 not connected
                }

/*          if (value == 'OFF') {
                value = 0;
            } else
            if (value == 'ON') {
                value = 1;
            } else if (value == 'NA') {
                value = 0;
                q = 0x82; // sensor not connected
            } else {
                value = parseFloat(value) || 0;
            }*/
            }
         }

         var newValue = null;
         if ( portType == cPortType_StandartIn ) {
            if ( oldState == false  && value == 'ON' ) {
               newValue = true;
            } else if ( oldState == true  && value == 'OFF' ) {
               newValue = false;
            }
            if ( newValue != null ) {
               adapter.log.debug('detected new value on port [' + _port  + ']: ' + newValue);
               adapter.setState( currentStateBranch, {val: newValue, ack: true, q: q});
            }

            adapter.getState( counterBranch, function(err,state) {
               var oldCounter = state.val;
               if ( oldCounter !== new_counter ) {
                  adapter.log.debug('detected new counter on port [' + _port  + ']: ' + new_counter);
                  adapter.setState( counterBranch, {val: new_counter, ack: true, q: q});
               }
            });

         } else if ( portType == cPortType_ReleOut || portType == cPortType_SimistorOut ) {
            if ( oldState == false  && value == 'ON' ) {
               newValue = true;
            } else if ( oldState == true  && value == 'OFF' ) {
               newValue = false;
            }
            if ( newValue != null ) {
               adapter.log.debug('detected new value on port [' + _port  + ']: ' + newValue);
               adapter.setState( currentStateBranch, {val: newValue, ack: true, q: q});
            }
         } else if ( portType == cPortType_DigitalSensor ) {
            newValue = value;
            if ( oldState !=  newValue ) {
               adapter.log.debug('detected new value on port [' + _port  + ']: ' + newValue);
               adapter.setState( currentStateBranch, {val: newValue, ack: true, q: q});
               //adapter.log.debug('temperature : ' + temperature);
               if ( temperature != null ) {
                  adapter.getState( temperatureBranch, function(err,state) {
                     //adapter.log.debug('old temperature on port [' + _port  + ']: ' + state.val);
                     //adapter.log.debug('new temperature on port [' + _port  + ']: ' + temperature);
                     if ( state.val != temperature ) {
                        //adapter.log.debug(' state.val != temperature');
                        adapter.setState( temperatureBranch, {val: temperature, ack: true, q: q});
                     }
                  });
               }
               if ( humidity != null ) {
                  adapter.getState( humidityBranch, function(err,state) {
                     if ( state.val != humidity ) {
                        adapter.setState( humidityBranch, {val: humidity, ack: true, q: q});
                     }
                  });
               }
            }
         }
      }); 

   });


/*
var cPortType_DimmedOut = 'DimmedOut'; //1
var cPortType_DigitalSensor  = 'DigitalSensor'; //3 цифровой вход dsen
var cPortType_I2C  = 'I2C'; // 4 
var cPortType_AnalogSensor  = 'AnalogSensor'; // 2 АЦП-вход для аналоговых датчиков


            if (_ports[_port].pty == 2) {
                f = value * _ports[_port].factor + _ports[_port].offset;
                value = Math.round(value * 1000) / 1000;

                adapter.log.debug('detected new value on port [' + _port + ']: ' + value + ', calc state ' + f);
                adapter.setState(_ports[_port].id, {val: f, ack: true, q: q});
            } else
            if (_ports[_port].pty == 4) { //NEW
                if (_ports[_port].value != value || _ports[_port].q != q) {
                    adapter.setState(_ports[_port].id, {val: value, ack: true, q: q});
                }
                if (secondary !== null && (_ports[_port].secondary != secondary || _ports[_port].q != q)) {
                    adapter.setState(_ports[_port].id + '_humidity', {val: secondary, ack: true, q: q});
                }
            } else
            if (_ports[_port].pty == 1) {
		if (_ports[_port].m == 1) {
                    value = Math.round(value * 1000) / 1000;

                    adapter.log.debug('detected new value on port [' + _port + ']: ' + value);
                    adapter.setState(_ports[_port].id, {val: value, ack: true, q: q});
		}
		if (_ports[_port].m == 0) {
                    adapter.log.debug('detected new value on port [' + _port + ']: ' + (value ? true : false));
                    adapter.setState(_ports[_port].id, {val: value ? true : false, ack: true, q: q});
                }
		if (_ports[_port].m == 2) {  // DS2413
		    if (value !== _ports[_port].value || _ports[_port].q != q) {
                        adapter.log.debug('detected new value on port [' + _port + '_A' + ']: ' + (value ? true : false));
                        adapter.setState(_ports[_port].id + '_A', {val: value ? true : false, ack: true, q: q});
		    }
                    if (secondary !== null && (_ports[_port].secondary != secondary || _ports[_port].q != q)) {
                        adapter.log.debug('detected new value on port [' + _port + '_B' + ']: ' + (secondary ? true : false));
                        adapter.setState(_ports[_port].id + '_B', {val: secondary ? true : false, ack: true, q: q});
                    }
                }
            }

            _ports[_port].value    = value;
            _ports[_port].q        = q;
            if (secondary !== null) _ports[_port].secondary = secondary;
        }
    }
*/
}


// обработка полученных данных от порта 1Wire-шины ------------------------------------------------------
function processPortStateW(_port, value) {      //1Wire
   var _ports = adapter.config.ports;
   //var _sensors1wBus = adapter.config.sensors1wbus;
   //var sensors1wBus = adapter.config.sensors1wbus;
   var q = 0;
   //var portAnswer = [];

   if (!_ports[_port]) {
       // No configuration found
       adapter.log.warn('Unknown port: ' + _port);
       return;
   }

   if (value !== null) {
      //var secondary = null;
      //var f;
      // Value can be 30c5b8000000:27.50;32c5b8000000:28.81;31c5b8000000:27.43.......
      // d0016c070000:24.43
      if (typeof value == 'string') {
         var sensorsAnswers  = value.split(';');
         var oneSensor = [];
         //var found    = false;
         //var foundedj = 0;
         var address_1w = "";
         var temperature = 0;
         for (var i = 0; i < sensorsAnswers.length; i++) {
            oneSensor    = sensorsAnswers[i].split(':');
            address_1w   = oneSensor[0];
            temperature  = parseFloat(oneSensor[1]);
            /*
            portAnswer[i].address_1w = oneSensor[0];
            portAnswer[i].value      = parseFloat(oneSensor[1]);
            //portAnswer.push( buff[offset + i] );
            found = false;
            foundedj = 0;
            for (j = 0; j < sensors1wBus.length; j++ ) {
                if (sensors1wBus[j].address1w === portAnswer[i].address_1w) {
                   found = true;
                   foundedj = j;
                }
            }
            if (!found) {
               foundedj = sensors1wBus.length + 1;
            }
            sensors1wBus[foundedj].address1w   = portAnswer[i].address_1w;
            sensors1wBus[foundedj].temperature = portAnswer[i].value;
            if ( !found || _sensors1wBus[foundedj].address1w !== sensors1wBus[foundedj].address1w ) {
               adapter.setState('sensors1wbus['.foundedj.'].address1w', {val: portAnswer[i].address_1w, ack: true, q: q});
            }
            if ( !found || _sensors1wBus[foundedj].temperature !== sensors1wBus[foundedj].temperature ) {
               adapter.setState('sensors1wbus['.foundedj.'].temperature', {val: portAnswer[i].value, ack: true, q: q});
            }
            */
//            if (!_sensors1wBus.portAnswer[i].address_1w || _sensors1wBus.portAnswer[i].address_1w.temperature !== portAnswer[i].value) {
               adapter.log.debug('новое значение температуры, адрес датчика = ' + address_1w + ', температура = ' + temperature );
               //adapter.setState('sensors1wbus.'.address_1w.'.temperature', {val: temperature, ack: true, q: q}, true);            
//            }
         }

         // If status changed
         if ( value !== _ports[_port].value ) {
            // JSON.parse(JSON.stringify(settings))
            _ports[_port].value    = value;
            _ports[_port].q        = q;
            adapter.log.debug('detected new value on port [' + _port + ']: ' + value );
            adapter.setState(_ports[_port].id, {val: value, ack: true, q: q}); 
         }
      }
   }
}    


//--------------------------------------------------------------------------------------------------------------
function pollStatus(dev) {
    getPortsState(function (err, data) {
        if (err) {
            adapter.log.warn(err);
            if (connected) {
                connected = false;
                adapter.log.warn('Device "' + IP + '" is disconnected');
                adapter.setState('info.connection', false, true);
            }
        } else {
            if (!connected) {
                adapter.log.info('Device "' + IP + '" is connected');
                connected = true;
                adapter.setState('info.connection', true, true);
            }
        }

        if (data) {
            var _ports = data.split(';');
            var p;
            var varName;
            for (p = 0; p < _ports.length; p++) {
                processPortState(p, _ports[p]);
            }

/*	    // process 1Wire 
            if (ask1WireTemp) {
                for (var po = 0; po < adapter.config.ports.length; po++) {
                    if (adapter.config.ports[po] && adapter.config.ports[po].pty == 3 && adapter.config.ports[po].d == 5) {
                       getPortStateW( adapter.config.ip,
                                      adapter.config.password,
                                      po,
                                      function (po, data) {
                                           processPortStateW(po, data);
                                      }
                                    );
                    }
                }
            }
*/
        }
    });
}

//---------------------------------------------------------------------------------------------------------------
// Process http://ioBroker:80/instance/?pt=6
// Функция обработки запросов от Меги к серверу
// Filippovsky
function restApi(req, res) {
    var values = {};
    var url    = req.url;
    var pos    = url.indexOf('?');

    if ( url == '/favicon.ico') {
       res.writeHead(200, {'Content-Type': 'text/html'});
       res.end('OK', 'utf8');
       return;
    }

    adapter.log.debug('got request url: '+req.url );

    if (pos != -1) {
        var arr = url.substring(pos + 1).split('&');
        url = url.substring(0, pos);

        for (var i = 0; i < arr.length; i++) {
            arr[i] = arr[i].split('=');
            values[arr[i][0]] = (arr[i][1] === undefined) ? null : arr[i][1];
        }
        if (values.prettyPrint !== undefined) {
            if (values.prettyPrint === 'false') values.prettyPrint = false;
            if (values.prettyPrint === null)    values.prettyPrint = true;
        }
        // Default value for wait
        if (values.wait === null) values.wait = 2000;
    }

    var parts  = url.split('/');
    var device = parts[1];

/*
    adapter.log.debug('device = '+device );
    adapter.log.debug('adapter.instance = '+adapter.instance );
    adapter.log.debug('ControllerName = '+ControllerName );
    adapter.log.debug('values.pt = '+values.pt );
*/


    if (!device || (device != adapter.instance && (!ControllerName || device != ControllerName))) {
        //adapter.log.debug('point RestApi 1' );
        if (device && values.pt !== undefined) {
            // Try to find name of the instance
            if (parseInt(device, 10) == device) {
                adapter.sendTo('megadjt.' + device, 'send', {pt: parseInt(values.pt, 10), val: values.ib});
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.end('OK', 'utf8');
            } else {
                // read all instances of megaD
                adapter.getForeignObjects('system.adapter.megadjt.*', 'instance', function (err, arr) {
                    if (arr) {
                        for (var id in arr) {
                            if (arr[id].native.name == device) {
                                adapter.sendTo(id, 'send', {pt: parseInt(values.pt, 10), val: values.ib});
                                res.writeHead(200, {'Content-Type': 'text/html'});
                                res.end('OK', 'utf8');
                                return;
                            }
                        }
                    }

                    res.writeHead(500);
                    res.end('Cannot find ' + device);
                });
            }
        } else {
            res.writeHead(500);
            res.end('Error: unknown device name "' + device + '"');
        }
        return;
    }

    //adapter.log.debug('point RestApi 2' );
    
    if (values.pt !== undefined) {
        //var _port = parseInt(values.pt, 10);
        //adapter.log.debug('point RestApi 3' );

        adapter.getState( adapter.namespace + '.ports.' + values.pt + '.portType', function (err, portType) {
            //adapter.log.debug('portType.val='+portType.val );

            if ( portType.val == cPortType_NotConnected ) {
               res.writeHead(500);
               res.end('Error: port "' + values.pt + '". Not connected!', 'utf8');
               return;

            } else if ( portType.val == cPortType_ReleOut || portType.val == cPortType_SimistorOut ) {
               if ( !values.m ) {
                  adapter.setState( adapter.namespace + '.ports.' + values.pt + '.currentState', true, true);
               } else if (values.m == '1') {
                  adapter.setState( adapter.namespace + '.ports.' + values.pt + '.currentState', false, true);
               }

            } else if ( portType.val == cPortType_StandartIn ) {
               adapter.getState( adapter.namespace + '.ports.' + values.pt + '.send2ServerAlwaysPressRelease', function (err, alwaysPR) {
                  if ( !values.m && !values.click ) {
                     // недолгое нажатие не в ClickMode
                     adapter.setState( adapter.namespace + '.ports.' + values.pt + '.shortClick',   true, true);
                     adapter.setState( adapter.namespace + '.ports.' + values.pt + '.currentState', true, true);
                  } else if ( values.m == '1' ) {
                     // отпускание клавиши
                     adapter.setState( adapter.namespace + '.ports.' + values.pt + '.Release', true, true);
                     adapter.setState( adapter.namespace + '.ports.' + values.pt + '.currentState', false, true);
                  } else if ( values.m == '2' ) {
                     // долгое нажатие
                     adapter.setState( adapter.namespace + '.ports.' + values.pt + '.longClick',    true, true);
                     adapter.setState( adapter.namespace + '.ports.' + values.pt + '.currentState', true, true);
                  } else if ( values.click == '1' ) {
                     // однократное нажатие
                     adapter.setState( adapter.namespace + '.ports.' + values.pt + '.shortClick',   true, true);
                     adapter.setState( adapter.namespace + '.ports.' + values.pt + '.currentState', true, true);
                  } else if ( values.click == '2' ) {
                     // двойное нажатие
                     adapter.setState( adapter.namespace + '.ports.' + values.pt + '.doubleClick',   true, true);
                     adapter.setState( adapter.namespace + '.ports.' + values.pt + '.currentState', true, true);
                  }

                  if ( values.cnt ) {
                     adapter.setState( adapter.namespace + '.ports.' + values.pt + '.counter', values.cnt, true);
                  }

                  res.writeHead(200, {'Content-Type': 'text/html'});
                  res.end('OK', 'utf8');
                  return;

               });

/*

var cPortType_DimmedOut = 'DimmedOut'; //1
var cPortType_DigitalSensor  = 'DigitalSensor'; //3 цифровой вход dsen
var cPortType_I2C  = 'I2C'; // 4 
var cPortType_AnalogSensor  = 'AnalogSensor'; // 2 АЦП-вход для аналоговых датчиков

*/

            }
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end('OK', 'utf8');
            return;
       });

       res.writeHead(200, {'Content-Type': 'text/html'});
       res.end('OK', 'utf8');
       return;


    } else {
        res.writeHead(500);
        res.end('Error: port "' + values.pt + '". Not configured!', 'utf8');
        return;
    }
/*
    res.writeHead(500);
    res.end('Error: invalid input "' + req.url + '". Expected /' + (adapter.config.name || adapter.instance) + '/?pt=X', 'utf8');
*/
}

//-----------------------------------------------------------------------------------------------------------------------
// отправка команды Меге
function sendCommand(port, value) {
    var data = 'cmd=' + port + ':' + value;

    //var parts = adapter.config.ip.split(':');

    var options = {
        host: IP,
        port: IPPort,
        path: '/' + Password + '/?' + data
    };
    adapter.log.debug('Отправляем команду "' + data + '" на ' + IP);

    // Set up the request
    http.get(options, function (res) {
        var xmldata = '';
        res.setEncoding('utf8');
        res.on('error', function (e) {
            adapter.log.warn(e.toString());
        });
        res.on('data', function (chunk) {
            xmldata += chunk;
        });
        res.on('end', function () {
            adapter.log.debug('Ответ от Меги "' + xmldata + '"');


        adapter.getState( adapter.namespace + '.ports.' + port + '.portType', function (err, portType) {
           if (portType) {
              if (portType.val == cPortType_ReleOut) {
                 // Set state only if positive response from megaD
                 adapter.setState( adapter.namespace + '.ports.' + port + '.currentState', value ? true : false, true);
              }
           }
        });
/*
            if (adapter.config.ports[port]) {
                // Set state only if positive response from megaD
                ///if (!adapter.config.ports[port].m) {
		if (adapter.config.ports[port].m == 0) {
                    adapter.setState(adapter.config.ports[port].id, value ? true : false, true);
                ///} else {
                }
                if (adapter.config.ports[port].m == 1) {
                    var f = value * adapter.config.ports[port].factor + adapter.config.ports[port].offset;
                    f = Math.round(f * 1000) / 1000;
                    adapter.setState(adapter.config.ports[port].id, f, true);
                }
            } else {
                adapter.log.warn('Unknown port ' + port);
            }
*/
        });
    }).on('error', function (e) {
        adapter.log.warn('На команду Меге получили ошибку ' + e.toString());
    });
}

//-----------------------------------------------------------------------------------------------------------------
function sendCommandToDSA(port, value) {          //DS2413 port A
    //http://192.168.1.14/sec/?cmd=7A:0 or &cmd=7A:1
    var data = 'cmd=' + port + 'A' + ':' + value;
    
    //var parts = adapter.config.ip.split(':');

    var options = {
        host: IP,
        port: IPPort,
        path: '/' + Password + '/?' + data
    };
    adapter.log.debug('Send command "' + data + '" to ' + IP);

    // Set up the request
    http.get(options, function (res) {
        var xmldata = '';
        res.setEncoding('utf8');
        res.on('error', function (e) {
            adapter.log.warn(e.toString());
        });
        res.on('data', function (chunk) {
            xmldata += chunk;
        });
        res.on('end', function () {
            adapter.log.debug('Response "' + xmldata + '"');
            if (adapter.config.ports[port]) {
                // Set state only if positive response from megaD
                adapter.setState(adapter.config.ports[port].id + '_A', value ? true : false, true);
            } else {
                adapter.log.warn('Unknown port ' + port);
            }
        });
    }).on('error', function (e) {
        adapter.log.warn('Got error by post request ' + e.toString());
    });
}

//------------------------------------------------------------------------------------------------------------
function sendCommandToDSB(port, value) {          //DS2413 port B
    //http://192.168.1.14/sec/?cmd=7A:0 or &cmd=7A:1
    var data = 'cmd=' + port + 'B' + ':' + value;
    
    //var parts = adapter.config.ip.split(':');

    var options = {
        host: IP,
        port: IPPort,
        path: '/' + Password + '/?' + data
    };
    adapter.log.debug('Send command "' + data + '" to ' + IP);

    // Set up the request
    http.get(options, function (res) {
        var xmldata = '';
        res.setEncoding('utf8');
        res.on('error', function (e) {
            adapter.log.warn(e.toString());
        });
        res.on('data', function (chunk) {
            xmldata += chunk;
        });
        res.on('end', function () {
            adapter.log.debug('Response "' + xmldata + '"');
	    if (adapter.config.ports[port]) {
                // Set state only if positive response from megaD
                adapter.setState(adapter.config.ports[port].id + '_B', value ? true : false, true);
            } else {
                adapter.log.warn('Unknown port ' + port);
            }
        });
    }).on('error', function (e) {
        adapter.log.warn('Got error by post request ' + e.toString());
    });
}

//----------------------------------------------------------------------------------------------------------
function sendCommandToCounter(port, value) {
    //'http://192.168.0.52/sec/?pt=2&cnt=0'
    var data = 'pt=' + port + '&cnt=' + (value || 0);

    //var parts = adapter.config.ip.split(':');

    var options = {
        host: IP,
        port: IPPort,
        path: '/' + Password + '/?' + data
    };
    adapter.log.debug('Send command "' + data + '" to ' + IP );

    // Set up the request
    http.get(options, function (res) {
        var xmldata = '';
        res.setEncoding('utf8');
        res.on('error', function (e) {
            adapter.log.warn(e.toString());
        });
        res.on('data', function (chunk) {
            xmldata += chunk;
        });
        res.on('end', function () {
            adapter.log.debug('Response "' + xmldata + '"');
        });
    }).on('error', function (e) {
        adapter.log.warn('Got error by post request ' + e.toString());
    });
}

//---------------------------------------------------------------------------------------------------------
function addToEnum(enumName, id, callback) {
    adapter.getForeignObject(enumName, function (err, obj) {
        if (!err && obj) {
            var pos = obj.common.members.indexOf(id);
            if (pos == -1) {
                obj.common.members.push(id);
                adapter.setForeignObject(obj._id, obj, function (err) {
                    if (callback) callback(err);
                });
            } else {
                if (callback) callback(err);
            }
        } else {
            if (callback) callback(err);
        }
    });
}

//---------------------------------------------------------------------------------------------------------
function removeFromEnum(enumName, id, callback) {
    adapter.getForeignObject(enumName, function (err, obj) {
        if (!err && obj) {
            var pos = obj.common.members.indexOf(id);
            if (pos != -1) {
                obj.common.members.splice(pos, 1);
                adapter.setForeignObject(obj._id, obj, function (err) {
                    if (callback) callback(err);
                });
            } else {
                if (callback) callback(err);
            }
        } else {
            if (callback) callback(err);
        }
    });
}

//----------------------------------------------------------------------------------------------------
function syncObjects() {

    adapter.config.longPress   = parseInt(adapter.config.longPress,   10) || 0;
    adapter.config.doublePress = parseInt(adapter.config.doublePress, 10) || 0;

    var newObjects = [];
    ports = {};
    if (adapter.config.ports) {
        for (var p = 0; p < adapter.config.ports.length; p++) {
            var settings = adapter.config.ports[p];
            ///var id = (p == 14 || p == 15) ? ('a' + (p - 8)) : ('p' + p);
            var id = (p == 37) ? ('p' + p) : ('p' + p);

            if (settings.name) {
                id += '_' + settings.name.replace(/[\s.]/g, '_');
            }
            adapter.config.ports[p].id  = adapter.namespace + '.' + id;
            adapter.config.ports[p].pty = parseInt(adapter.config.ports[p].pty, 10) || 0;
            if (adapter.config.ports[p].m !== undefined) {
                adapter.config.ports[p].m = parseInt(adapter.config.ports[p].m, 10) || 0;
            }
            if (adapter.config.ports[p].d !== undefined) {
                adapter.config.ports[p].d = parseInt(adapter.config.ports[p].d, 10) || 0;
            }
            /*if (adapter.config.ports[p].misc !== undefined) {
                adapter.config.ports[p].misc = parseInt(adapter.config.ports[p].misc, 10) || 0;
            }*/
	    if (adapter.config.ports[p].misc === 'false' || adapter.config.ports[p].misc === false) adapter.config.ports[p].misc = 0;
            if (adapter.config.ports[p].misc === 'true'  || adapter.config.ports[p].misc === true)  adapter.config.ports[p].misc = 1;
		
            settings.port = p;

            var obj = {
                _id: adapter.namespace + '.' + id,
                common: {
                    name: settings.name || ('P' + p),
                    role: settings.role,
                    type: settings.type  // ??????????????????
                },
                native: JSON.parse(JSON.stringify(settings)),
                type:   'state'
            };
            var obj1 = null;
            var obj2 = null;
            var obj3 = null;

            // input
            if (!settings.pty) {
                //obj.common.write = false;
                obj.common.write = true; // надо иметь возможность писать сюда данные от меги
                obj.common.read  = true;
                obj.common.def   = false;
                obj.common.desc  = 'P' + p + ' - digital input';
                obj.common.type  = 'boolean';
                if (!obj.common.role) obj.common.role = 'state';

                ///if (settings.m == 1) {
		if (settings.m == 1 || settings.misc == 1) {
                    if (settings.long && adapter.config.longPress) {
                        obj1 = {
                            _id: adapter.namespace + '.' + id + '_long',
                            common: {
                                name:  obj.common.name + '_long',
                                role:  'state',
                                //write: false,
                                write: true,
                                read:  true,
                                def:   false,
                                desc:  'P' + p + ' - long press',
                                type:  'boolean'
                            },
                            native: JSON.parse(JSON.stringify(settings)),
                            type: 'state'
                        };
                        if (obj1.native.double !== undefined) delete obj1.native.double;
                    }
                }

                if (settings.double && adapter.config.doublePress) {
                    obj2 = {
                        _id: adapter.namespace + '.' + id + '_double',
                        common: {
                            name:  obj.common.name + '_double',
                            role:  'state',
                            //write: false,
                            write: true,
                            read:  true,
                            def:   false,
                            desc:  'P' + p + ' - double press',
                            type:  'boolean'
                        },
                        native: JSON.parse(JSON.stringify(settings)),
                        type:   'state'
                    };
                    if (obj2.native.long !== undefined) delete obj2.native.long;
                }
                obj3 = {
                    _id: adapter.namespace + '.' + id + '_counter',
                    common: {
                        name:  obj.common.name + '_counter',
                        role:  'state',
                        write: true,
                        read:  true,
                        def:   0,
                        desc:  'P' + p + ' - inputs counter',
                        type:  'number'
                    },
                    native: JSON.parse(JSON.stringify(settings)),
                    type:   'state'
                };
            } else
            // output
            if (settings.pty == 1) {
                ///if (settings.m) {
		if (settings.m == 1) {
                    settings.factor  = parseFloat(settings.factor || 1);
                    settings.offset  = parseFloat(settings.offset || 0);

                    obj.common.write = true;
                    obj.common.read  = true;
                    obj.common.def   = 0;
                    obj.common.desc  = 'P' + p + ' - digital output (PWM)';
                    obj.common.type  = 'number';
                    obj.common.min   = 0;
                    obj.common.max   = 255;
                    if (!obj.common.role) obj.common.role = 'level';
                    ///obj.native.pwm = settings.pwm;
                } else
		if (settings.m == 0) {
                    obj.common.write = true;
                    obj.common.read  = true;
                    obj.common.def   = false;
                    obj.common.desc  = 'P' + p + ' - digital output';
                    obj.common.type  = 'boolean';
                    if (!obj.common.role) obj.common.role = 'state';
                } else
		if (settings.m == 2) {   //DS2413
                    obj = {
                        _id: adapter.namespace + '.' + id + '_A',
                        common: {
                            name:  obj.common.name + '_A',
                            role:  'button',
                            write: true,
                            read:  true,
                            def:   false,
                            desc:  'P' + p + ' - digital output A',
                            type:  'boolean'
                        },
                        native: JSON.parse(JSON.stringify(settings)),
                        type:   'state'
                    };
                    if (obj.native.misc !== undefined) delete obj.native.misc;
                    if (obj.native.m2 !== undefined) delete obj.native.m2;
                    if (obj.native.fr !== undefined) delete obj.native.fr;
                    ////if (obj.native.id) obj.native.id = adapter.namespace + '.' + id + '_A';
                    
		    obj1 = {
                        _id: adapter.namespace + '.' + id + '_B',
                        common: {
                            name:  obj.native.name + '_B',
			    role:  'button',
                            write: true,
                            read:  true,
                            def:   false,
                            desc:  'P' + p + ' - digital output B',
                            type:  'boolean'
                        },
                        native: JSON.parse(JSON.stringify(settings)),
                        type: 'state'
                    };
                    if (obj1.native.misc !== undefined) delete obj1.native.misc;
                    if (obj1.native.m2 !== undefined) delete obj1.native.m2;
                    if (obj1.native.fr !== undefined) delete obj1.native.fr;
                    ////if (obj1.native.id) obj1.native.id = adapter.namespace + '.' + id + '_B';
                }
            } else
            // analog ADC
            if (settings.pty == 2) {
                settings.factor  = parseFloat(settings.factor || 1);
                settings.offset  = parseFloat(settings.offset || 0);

                //obj.common.write = false;
                obj.common.write = true;
                obj.common.read  = true;
                obj.common.def   = 0;
                obj.common.min   = settings.offset;
                obj.common.max   = settings.offset + settings.factor;
                obj.common.desc  = 'P' + p + ' - analog input';
                obj.common.type  = 'number';
                if (!obj.common.role) obj.common.role = 'value';
                obj.native.threshold = settings.offset + settings.factor * settings.misc;
            } else
            // digital temperature sensor
            if (settings.pty == 3) {
                //obj.common.write = false;
                obj.common.write = true;
                obj.common.read  = true;
                obj.common.def   = 0;
                obj.common.type  = 'number';
                if (settings.d == 1 || settings.d == 2 || settings.d == 3) {
                    obj.common.min = -30;
                    obj.common.max = 30;
                    obj.common.unit = '°C';
                    obj.common.desc = 'P' + p + ' - temperature';
                    obj.common.type = 'number';
                    if (!obj.common.role) obj.common.role = 'value.temperature';

                    if (settings.d == 1 || settings.d == 2) {
                        obj1 = {
                            _id: adapter.namespace + '.' + id + '_humidity',
                            common: {
                                name: obj.common.name + '_humidity',
                                role: 'value.humidity',
                                //write: false,
                                write: true,
                                read: true,
                                unit: '%',
                                def: 0,
                                min: 0,
                                max: 100,
                                desc: 'P' + p + ' - humidity',
                                type: 'number'
                            },
                            native: {
                                port: p
                            },
                            type: 'state'
                        };
                    }
                } else if (settings.d == 4) { // iButton
                    obj.common.desc = 'P' + p + ' - iButton';
                    obj.common.type = 'string';
                    obj.common.def  = '';
		} else if (settings.d == 5) { // 1Wire
		    obj = {
                        _id: adapter.namespace + '.' + id + '_temperature1',
                        common: {
                            name: obj.common.name + '_temperature1',
                            role: 'value.temperature',
                            //write: false,
                            write: true,
                            read: true,
                            unit: '°C',
                            def: 0,
                            min: -30,
                            max: 30,
                            desc: 'P' + p + ' - temperature',
                            type: 'number'
                        },
                        ////native: JSON.parse(JSON.stringify(settings)),
                        native: {
                        port: p,
                        name: 'P' + p
                        },
                        type:   'state'
                    };
                    obj1 = {
                        _id: adapter.namespace + '.' + id + '_temperature2',
                        common: {
                            name: obj.native.name + '_temperature2',
                            role: 'value.temperature',
                            //write: false,
                            write: true,
                            read: true,
                            unit: '°C',
                            def: 0,
                            min: -30,
                            max: 30,
                            desc: 'P' + p + ' - temperature',
                            type: 'number'
                        },
                        ////native: JSON.parse(JSON.stringify(settings)),
                        native: {
                        port: p,
                        name: 'P' + p
			},
                        type: 'state'
                    };
                    obj2 = {
                        _id: adapter.namespace + '.' + id + '_temperature3',
                        common: {
                            name: obj.native.name + '_temperature',
                            role: 'value.temperature',
                            //write: false,
                            write: true,
                            read: true,
                            unit: '°C',
                            def: 0,
                            min: -30,
                            max: 30,
                            desc: 'P' + p + ' - temperature',
                            type: 'number'
                        },
                        ////native: JSON.parse(JSON.stringify(settings)),
                        native: {
                        port: p,
                        name: 'P' + p
                        },
                        type: 'state'
		    };
                }    
            /*} else
            // internal digital temperature sensor
            if (settings.pty == 4) {
                obj.common.write = false;
                obj.common.read  = true;
                obj.common.def   = 0;
                obj.common.min   = -30;
                obj.common.max   = 30;
                obj.common.unit  = '°C';
                obj.common.desc  = 'P' + p + ' - temperature';
                obj.common.type  = 'number';
                if (!obj.common.role) obj.common.role = 'value.temperature';*/
	    } else
            // I2C sensor  //NEW
            if (settings.pty == 4) {
                //obj.common.write = false;
                obj.common.write = true;
                obj.common.read  = true;
                obj.common.def   = 0;
                obj.common.type  = 'number';
                if (settings.d == 1) {
                    obj.common.min = -30;
                    obj.common.max = 30;
                    obj.common.unit = '°C';
                    obj.common.desc = 'P' + p + ' - temperature';
                    obj.common.type = 'number';
                    if (!obj.common.role) obj.common.role = 'value.temperature';
		    if (settings.d == 1) {
                        obj1 = {
                            _id: adapter.namespace + '.' + id + '_humidity',
                            common: {
                                name: obj.common.name + '_humidity',
                                role: 'value.humidity',
                                //write: false,
                                write: true,
                                read: true,
                                unit: '%',
                                def: 0,
                                min: 0,
                                max: 100,
                                desc: 'P' + p + ' - humidity',
				type: 'number'
                            },
                            native: {
                                port: p
                            },
                            type: 'state'
                        };
                    }
                } else if (settings.d == 2 || settings.d == 3) { // Light Sensors
                    obj.common.desc = 'P' + p + ' - light';
                    obj.common.type = 'number';
                    obj.common.def  = 0;
                    obj.common.role = 'value';
                }
            } else {
                continue;
            }

            newObjects.push(obj);
            ports[obj._id] = obj;

            if (obj1) {
                newObjects.push(obj1);
                ports[obj1._id] = obj1;
            }
            if (obj2) {
                newObjects.push(obj2);
                ports[obj2._id] = obj2;
            }
            if (obj3) {
                newObjects.push(obj3);
                ports[obj3._id] = obj3;
            }
        }
    }

    // read actual objects
    adapter.getStatesOf('', '', function (err, _states) {
        var i;
        var j;
        var found;
        // synchronize actual and new

        // Sync existing
        for (i = 0; i < newObjects.length; i++) {
            for (j = 0; j < _states.length; j++) {
                if (newObjects[i]._id == _states[j]._id) {
                    var mergedObj = JSON.parse(JSON.stringify(_states[j]));

                    if (mergedObj.common.history) delete mergedObj.common.history;
                    if (mergedObj.common.mobile)  delete mergedObj.common.mobile;

                    if (JSON.stringify(mergedObj) != JSON.stringify(newObjects[i])) {
                        adapter.log.info('Update state ' + newObjects[i]._id);
                        if (_states[j].common.history) newObjects[i].common.history = _states[j].common.history;
                        if (_states[j].common.mobile)  newObjects[i].common.mobile  = _states[j].common.mobile;
                        adapter.setObject(newObjects[i]._id, newObjects[i]);
                    }

/*
                    if (newObjects[i].native.room != _states[j].native.room) {
                        adapter.log.info('Update state room ' + newObjects[i]._id + ': ' + _states[j].native.room + ' => ' + newObjects[i].native.room);
                        if (_states[j].native.room) removeFromEnum(_states[j].native.room, _states[j]._id);
                        if (newObjects[i].native.room) addToEnum(newObjects[i].native.room, newObjects[i]._id);
                    } */

                    if (newObjects[i].native.func != _states[j].native.func) {
                        adapter.log.info('Update state func ' + newObjects[i]._id + ': ' + _states[j].native.func + ' => ' + newObjects[i].native.func);
                        if (_states[j].native.func) removeFromEnum(_states[j].native.func, _states[j]._id);
                        if (newObjects[i].native.func) addToEnum(newObjects[i].native.func, newObjects[i]._id);
                    }

                    break;
                }
            }
        }

        // Add new
        for (i = 0; i < newObjects.length; i++) {
            found = false;
            for (j = 0; j < _states.length; j++) {
                if (newObjects[i]._id == _states[j]._id) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                adapter.log.info('Add state ' + newObjects[i]._id);

                adapter.setObject(newObjects[i]._id, newObjects[i]);
                // check room
                //if (newObjects[i].native.room) addToEnum(newObjects[i].native.room, newObjects[i]._id);
                //if (newObjects[i].native.func) addToEnum(newObjects[i].native.func, newObjects[i]._id);
            }
        }

         /* пока отключаем удаление
        // Delete old
        for (j = 0; j < _states.length; j++) {
            found = false;
            for (i = 0; i < newObjects.length; i++) {
                if (newObjects[i]._id == _states[j]._id) {
                    found = true;
                    break;
                }
            }
            if (( _states[j]._id != adapter.namespace+'.sms.apiKey' ) 
               && ( _states[j]._id != adapter.namespace+'.sms.phones' ) 
               && ( _states[j]._id != adapter.namespace+'.sms.text' ) 
               && ( _states[j]._id != adapter.namespace+'.sms.enabled' ) 
               && ( _states[j]._id != adapter.namespace+'.firmware.version' ) 
               && ( _states[j]._id != adapter.namespace+'.firmware.last_known_version' ) 
               && ( _states[j]._id != adapter.namespace+'.firmware.is_actual' ) 
              )
            {
               if (!found) {
                  adapter.log.info('Delete state ' + _states[j]._id);
                  adapter.delObject(_states[j]._id);
                  if (_states[j].native.room) removeFromEnum(_states[j].native.room, _states[j]._id);
                  if (_states[j].native.func) removeFromEnum(_states[j].native.func, _states[j]._id);
               }
            }
        }
        */

        // if internal temperature desired
        /*for (var po = 0; po < adapter.config.ports.length; po++) {
            if (adapter.config.ports[po].pty == 4) {
                askInternalTemp = true;
                break;
            }
        }*/
	    
	// if 1Wire
	for (var po = 0; po < adapter.config.ports.length; po++) {
            if (adapter.config.ports[po].pty && // для остановки undefined
                  adapter.config.ports[po].pty == 3 && adapter.config.ports[po].d == 5) {
                ask1WireTemp = true;
                break;
            }
        }

        if ( IP && IP != '0.0.0.0') {
            pollStatus();
            if ( adapter.config.pollInterval && adapter.config.pollInterval > 0 ) {
               setInterval(pollStatus, adapter.config.pollInterval * 1000);
            }
        }

/* ??? filippovsky
        if (adapter.config.ip && adapter.config.ip != '0.0.0.0') {
            pollStatus();
            setInterval(pollStatus, adapter.config.pollInterval * 1000);
        }*/

    });
}
//---------------------------------------------------------------------------------------------
function createConfigItemIfNotExists ( name, type, desc, firstValue ) {
   var obj = null;
   var newObjects = [];
   var id = adapter.namespace + '.' + name;
   var found;
   var role = "";
   var subtype = "";
   var typeObj = "";
   var unit = null;

   found = false;
   adapter.getObject( name, function(err,obj) {
       if (obj) {
          found = true;
       }

       if (found) {
          /*if ( !obj.val  && type != 'statebool' ) {
             if ( type == 'state' ) {
                adapter.setState( name, {val: '', ack: true});
             //} else if ( type == 'statebool' ) {
             //   adapter.setState( name, {val: false, ack: true});
             } else if ( type == 'statenum' ) {
                adapter.setState( name, {val: 0, ack: true});
             } else if ( type == 'statetemperature' ) {
                adapter.setState( name, {val: 0, ack: true});
             } else if ( type == 'statehumidity' ) {
                adapter.setState( name, {val: 0, ack: true});
             }
             adapter.log.info('* bugFix: Set first value ' + firstValue + ' for state ' + id );
         }  */
         return;
      }


         adapter.log.info('Add state ' + id);
         if ( type == 'state' ) {
            role = 'state';
            subtype = 'string';
            typeObj = 'state';
         } else if ( type == 'statebool' ) {
            role = 'state';
            subtype = 'boolean';
            typeObj = 'state';
         } else if ( type == 'statenum' ) {
            role = 'state';
            subtype = 'number';
            typeObj = 'state';
         } else if ( type == 'statetemperature' ) {
            role = 'value.temperature';
            subtype = 'number';
            typeObj = 'state';
            unit = '°C';
            /*                def: 0,
                            min: -30,
                            max: 30,*/
         } else if ( type == 'statehumidity' ) {
            role = 'value.humidity';
            subtype = 'number';
            typeObj = 'state';
            unit = '%';
            /*                    def: 0,
                                min: 0,
                                max: 100,*/
         }
         obj = {
                    _id: id,
                   name: name,
                 common: {
                             name: name,
                             role: role,
                            write: true,
                             read: true,
                              def: "",
                             desc: desc,
                             type: subtype,
                             unit: unit
                         },
                 native: {},
                   type: typeObj
               };

         adapter.setObject( id, obj );
  
         //if ( firstValue || (subtype == 'number') ) {
            adapter.setState( name, {val: firstValue, ack: true});
            adapter.log.info('Set first value ' + firstValue + ' for state ' + id );
         //}
  });
}
//---------------------------------------------------------------------------------------------
function configInit( callback ) {
   var i;
   var sport;

   createConfigItemIfNotExists ( 'sms.apiKey', 'state', 'API KEY для отправки SMS с megadjt.sms.ru', '' );
   createConfigItemIfNotExists ( 'sms.enabled', 'statebool', 'Включить отправку SMS', 'false' );
   createConfigItemIfNotExists ( 'sms.phones', 'state', 'Номера телефонов (через запятую) для отправки SMS', '' );
   createConfigItemIfNotExists ( 'sms.text', 'state', 'Текст для отправки SMS', '' );

   createConfigItemIfNotExists ( 'firmware.version', 'state', 'Версия прошивки устройства', '-' );
   createConfigItemIfNotExists ( 'firmware.last_known_version', 'state', 'Текущий номер актуальной версии прошивки', fw_version_actual );
   createConfigItemIfNotExists ( 'firmware.is_actual', 'statebool', 'Мега прошита самой свежей версией?', 'false' );

   createConfigItemIfNotExists ( 'controller.model', 'state', 'Модель контроллера', '' );
   createConfigItemIfNotExists ( 'controller.xp1model', 'state', 'Модель исполнительного модуля на XP1', 'none' );
   createConfigItemIfNotExists ( 'controller.xp2model', 'state', 'Модель исполнительного модуля на XP2', 'none' );
   createConfigItemIfNotExists ( 'controller.ip', 'state', 'IP-адрес контроллера', '192.168.0.14' );
   createConfigItemIfNotExists ( 'controller.ipport', 'statenum', 'IP-порт контроллера', 80 );
   createConfigItemIfNotExists ( 'controller.password', 'state', 'Пароль контроллера', 'sec' );
   createConfigItemIfNotExists ( 'controller.name', 'state', 'Имя контроллера', '' );
   sport = 91 +  adapter.instance;
   adapter.log.debug('sport= '+sport);
   createConfigItemIfNotExists ( 'controller.serverPort', 'statenum', 'Порт сервера', sport );
   createConfigItemIfNotExists ( 'controller.pollInterval', 'statenum', 'Интервал опроса Меги (сек)', 60 );
   createConfigItemIfNotExists ( 'controller.serverIP', 'state', 'IP-адрес сервера', '255.255.255.255' );
   createConfigItemIfNotExists ( 'controller.gateway',  'state', 'IP-адрес шлюза', '255.255.255.255' );
   createConfigItemIfNotExists ( 'controller.script',  'state', 'Скрипт сервера', '/' +  adapter.instance );
   createConfigItemIfNotExists ( 'controller.serverType', 'state', 'Тип сервера', 'HTTP' );
   createConfigItemIfNotExists ( 'controller.watchDogPort',  'state', 'Номер порта, сценарий которого будет выполнен при недоступности сервера', '' );
   createConfigItemIfNotExists ( 'controller.srvLoop',  'statebool', 'Отправка данных с Меги 1 раз в минуту', 'false' );

   createConfigItemIfNotExists ( 'controller.armed.Mega',  'statebool', 'Состояние охраны средствами Меги', 'false' );
   createConfigItemIfNotExists ( 'controller.armed.Server',  'statebool', 'Состояние охраны средствами сервера', 'false' );

   createConfigItemIfNotExists ( 'gsm.enabled', 'statebool', 'Включить отправку SMS средствами Меги', 'false' );
   createConfigItemIfNotExists ( 'gsm.phone',   'state', 'Номер телефона для GSM-связи средствами Меги', '' );
   createConfigItemIfNotExists ( 'gsm.timeout', 'statenum', 'Таймаут для отправки SMS средствами Меги', 3 );

   for ( i=0; i <= 37; i ++ ) {
       createConfigItemIfNotExists ( 'ports.'+ i + '.room', 'state', 'Комната, к которой привязан порт ' + i, '' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.func', 'state', 'Функция, которую выполняет порт ' + i, '' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.portType', 'state', 'Тип порта ' + i, cPortType_NotConnected );
       createConfigItemIfNotExists ( 'ports.'+ i + '.defaultAction', 'state', 'Сценарий по умолчанию порта ' + i, '' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.defaultRunAlways', 'statebool', 'Выполнять сценарий по умолчанию даже при наличии сервера', 'false' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.netAction', 'state', 'Сетевой сценарий для порта ' + i, '' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.netRunOnlyWhenServerOut', 'statebool', 'Выполнять сетевой сценарий только при отсутствии сервера', 'false' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.portMode', 'state', 'Режим работы порта ' + i, cPortMode_PressOnly );
       createConfigItemIfNotExists ( 'ports.'+ i + '.send2ServerAlwaysPressRelease', 'statebool', 'Отправлять на сервер всегда в режиме P&R', 'false' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.tremorDefenceDisabled', 'statebool', 'Отключить защиту от дребезга', 'false' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.displayPort', 'state', 'Порт дисплея', '' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.defaultState', 'statebool', 'Состояние порта по умолчанию', 'false' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.digitalSensorType', 'state', 'Тип цифрового датчика', '' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.currentState', 'statebool', 'Текущее состояние порта ВКЛ/ВЫКЛ', 'false' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.counter', 'statenum', 'Счетчик срабатываний порта ' + i, 0 );
       createConfigItemIfNotExists ( 'ports.'+ i + '.temperature', 'statetemperature', 'Температура', null );
       createConfigItemIfNotExists ( 'ports.'+ i + '.humidity', 'statehumidity', 'Влажность', null );
       createConfigItemIfNotExists ( 'ports.'+ i + '.digitalSensorMode', 'state', 'Режим работы датчика', '' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.shortClick', 'statebool', 'Краткое однократное нажатие на кнопку', 'false' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.Release',    'statebool', 'Отпускание кнопки', 'false' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.longClick',  'statebool', 'Долгое нажатие на кнопку', 'false' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.doubleClick',  'statebool', 'Двойное нажатие на кнопку', 'false' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.group', 'state', 'Группа порта', '' );
       createConfigItemIfNotExists ( 'ports.'+ i + '.GSMmode', 'state', 'Режим отправки SMS средствами Меги', cGSMmodeNo );
       createConfigItemIfNotExists ( 'ports.'+ i + '.SMSmode', 'state', 'Режим отправки SMS средствами сервера', cGSMmodeNo );
       createConfigItemIfNotExists ( 'ports.'+ i + '.porogValue', 'statenum', 'Пороговое значение', 0.00 );
       createConfigItemIfNotExists ( 'ports.'+ i + '.hysteresis', 'statenum', 'Гистерезис', 0.00 );
       createConfigItemIfNotExists ( 'ports.'+ i + '.portOutMode', 'state', 'Режим работы выхода', cOutPortMode_SW );
       createConfigItemIfNotExists ( 'ports.'+ i + '.defaultPWM', 'statenum', 'Значение ШИМ по умолчанию', 0 );
       createConfigItemIfNotExists ( 'ports.'+ i + '.smooth', 'statebool', 'Плавное изменение', 'false' );
   }

   for ( i=1; i <= 3; i ++ ) {
       createConfigItemIfNotExists ( 'PWM.timers.'+ i +'.freq', 'state', 'Частота ШИМ для данного таймера', cPWM_Freq_Normal );
   }

   if ( callback ) {
      if (callback) callback( /*error, data*/ );
   }

}
//--------------------------------------------------------------------------------------------
function setGlobal ( callback ) {
   adapter.getState(adapter.namespace + '.controller.ip', function (err, state_ip) {
      if (state_ip) {
         IP = state_ip.val;
      }
      adapter.getState(adapter.namespace + '.controller.ipport', function (err, state_port) {
         if (state_port) {
            IPPort = state_port.val || 80;
         } else {
            IPPort = 80;
         }
         adapter.getState(adapter.namespace + '.controller.password', function (err, state_pwd) {
            if (state_pwd) {
               Password = state_pwd.val;
            }
            adapter.getState(adapter.namespace + '.controller.name', function (err, state_name) {
               if (state_name) {
                  ControllerName = state_name.val;
               }
               adapter.getState(adapter.namespace + '.controller.serverPort', function (err, state_srv) {
                  if (state_srv) {
                     ServerPort = state_srv.val;
                  }
   adapter.log.debug('IP='+IP);
   adapter.log.debug('IPPort='+IPPort);
   adapter.log.debug('Password='+Password);
   adapter.log.debug('ControllerName='+ControllerName);
   adapter.log.debug('ServerPort='+ServerPort);
               });
            });
         });
      });
   });

   if ( callback ) {
      if (callback) callback( /*error, data*/ );
   }

}
//--------------------------------------------------------------------------------------------
function states2Admin ( obj ) {
   var x;
   //adapter.log.debug('states2Admin point 0' );
   adapter.getStates('*', function(err,states) {
      //adapter.log.debug('states2Admin point 1' );
      x = JSON.stringify(states); 
      if (obj.callback) {
           //adapter.log.debug('states2Admin point 2' );
           //adapter.log.debug('obj.from=' + obj.from );
           adapter.sendTo(obj.from, obj.command, {error: '', response: x }, obj.callback );
      }
   });
}

//--------------------------------------------------------------------------------------------
function debugAllStates () {
   var x;
   adapter.getStates('*', function(err,states) {
      x = JSON.stringify(states); 
      var Setup = JSON.parse( x );
// yes      adapter.log.debug('>> '+ Setup['megadjt.0.ports.0.room'].val );

  /*    var i;
      for (i = 0; i < states.length; i++) {
         adapter.log.debug('State ' + states[i]._id +' ->  ' + states[i].val );
      }*/

   });
       

}

//------------------------------------------------------------------------------------------------------------------
// Message is IP address
function savePort(obj) {

   adapter.log.info('Сохраняем настройки для порта '+obj.message.portNum);
   adapter.log.debug( 'obj.message.portNum =  '+obj.message.portNum);
   adapter.log.debug( 'obj.message.room = '+ obj.message.room );
   adapter.log.debug( 'obj.message.fnc = '+ obj.message.fnc );
   adapter.log.debug( 'obj.message.portType = '+ obj.message.portType );
   adapter.log.debug( 'obj.message.defaultAction = '+ obj.message.defaultAction );
   adapter.log.debug( 'obj.message.defaultRunAlways = '+ obj.message.defaultRunAlways );
   adapter.log.debug( 'obj.message.netAction = '+ obj.message.netAction );
   adapter.log.debug( 'obj.message.netRunOnlyWhenServerOut = '+ obj.message.netRunOnlyWhenServerOut );
   adapter.log.debug( 'obj.message.portMode = '+ obj.message.portMode );
   adapter.log.debug( 'obj.message.send2ServerAlwaysPressRelease = '+ obj.message.send2ServerAlwaysPressRelease );
   adapter.log.debug( 'obj.message.tremorDefenceDisabled = '+ obj.message.tremorDefenceDisabled );
   adapter.log.debug( 'obj.message.displayPort = '+ obj.message.displayPort );
   adapter.log.debug( 'obj.message.numXP = '+ obj.message.numXP );
   adapter.log.debug( 'obj.message.xp1model = '+ obj.message.xp1model );
   adapter.log.debug( 'obj.message.xp2model = '+ obj.message.xp2model );
   adapter.log.debug( 'obj.message.defaultState = '+ obj.message.defaultState );
   adapter.log.debug( 'obj.message.digSensorType = '+ obj.message.digSensorType );
   adapter.log.debug( 'obj.message.digSensorMode = '+ obj.message.digSensorMode );
   adapter.log.debug( 'obj.message.GSMmode = '+ obj.message.GSMmode );
   adapter.log.debug( 'obj.message.portOutMode = '+ obj.message.portOutMode );
   adapter.log.debug( 'obj.message.group = '+ obj.message.group );
   adapter.log.debug( 'obj.message.freq  = '+ obj.message.freq  );
   adapter.log.debug( 'obj.message.defPWM  = '+ obj.message.defPWM  );
   adapter.log.debug( 'obj.message.smooth  = '+ obj.message.smooth  );

   var portNum = obj.message.portNum;
   var room    = obj.message.room;
   var fnc     = obj.message.fnc;
   var portType = obj.message.portType;
   var defaultAction = obj.message.defaultAction || '';
   var defaultRunAlways = obj.message.defaultRunAlways || 0;
   var netAction = obj.message.netAction || '';
   var netRunOnlyWhenServerOut = obj.message.netRunOnlyWhenServerOut || 0;
   var portMode = obj.message.portMode || cPortMode_PressOnly;
   var send2ServerAlwaysPressRelease = obj.message.send2ServerAlwaysPressRelease || 0;
   var tremorDefenceDisabled = obj.message.tremorDefenceDisabled || 0;
   var displayPort = obj.message.displayPort || '';
   var numXP = obj.message.numXP;
   var xp1model = obj.message.xp1model;
   var xp2model = obj.message.xp2model;
   var defaultState = obj.message.defaultState || false;
   var digSensorType = obj.message.digSensorType || ''; //?
   var digSensorMode = obj.message.digSensorMode || ''; //?
   var GSMmode = obj.message.GSMmode || cGSMmodeNo; 
   var portOutMode = obj.message.portOutMode || cOutPortMode_SW; 
   var group = obj.message.group || ''; 
   var freq  = obj.message.freq || cPWM_Freq_Normal;  
   var pwmTimer = '1';
   var defPWM = obj.message.defPWM || 0;
   var smooth = obj.message.smooth || false;

   if (defaultRunAlways == 1) {
      defaultRunAlways = true;
   } else {
      defaultRunAlways = false;
   }
   if (netRunOnlyWhenServerOut == 1) {
      netRunOnlyWhenServerOut = true;
   } else {
      netRunOnlyWhenServerOut = false;
   }
   if (send2ServerAlwaysPressRelease == 1) {
      send2ServerAlwaysPressRelease = true;
   } else {
      send2ServerAlwaysPressRelease = false;
   }
   if (tremorDefenceDisabled == 1) {
      tremorDefenceDisabled = true;
   } else {
      tremorDefenceDisabled = false;
   }
/*   if (defaultState == 1) {
      defaultState = true;
   } else {
      defaultState = false;
   }
*/

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.room',
      function (err, state) {
         var oldvalue = "";
         var linkedstate  = "";
         var linkedstate1 = "";

         if ( fnc == 'enum.functions.temperature' ) {
            linkedstate  = adapter.namespace + '.ports.' + portNum + '.temperature';
            linkedstate1 = adapter.namespace + '.ports.' + portNum + '.currentState';
         } else {
            linkedstate   = adapter.namespace + '.ports.' + portNum + '.currentState';
            linkedstate1  = adapter.namespace + '.ports.' + portNum + '.temperature';
         }
         var group = adapter.namespace + '.ports.' + portNum;
         var channel = 'ports.' + portNum;
         var id    = 'currentState';
         if ( state ) oldvalue = state.val;
         if ( oldvalue != room ) {
            adapter.setState( 'ports.' + portNum + '.room', {val: room, ack: true});
            if ( oldvalue ) {
               adapter.log.debug(' -- удаляем порт '+linkedstate+' из комнаты ' + oldvalue );
               removeFromEnum( oldvalue, linkedstate  );
               removeFromEnum( oldvalue, linkedstate1 );
               removeFromEnum( 'enum.rooms', linkedstate  );
               removeFromEnum( 'enum.rooms', linkedstate1 );
            } 
            if (room) {
               adapter.log.debug(' -- добавляем порт '+linkedstate+' в комнату ' + room );
               addToEnum( room, linkedstate );
            }

            adapter.extendObject( linkedstate, {
                                      native: {
                                            room: room
                                      }
                                  });
            adapter.extendObject( linkedstate1, {
                                      native: {
                                            room: ''
                                      }
                                  });


            adapter.log.info( 'ports.' + portNum + '.room : '+ oldvalue + ' -> ' + room );
         }
      }
   );

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.func',
      function (err, state ) {
         var oldvalue = "";
         var linkedstate  = "";
         var linkedstate1 = "";

         if ( fnc == 'enum.functions.temperature' ) {
            linkedstate  = adapter.namespace + '.ports.' + portNum + '.temperature';
            linkedstate1 = adapter.namespace + '.ports.' + portNum + '.currentState';
         } else {
            linkedstate   = adapter.namespace + '.ports.' + portNum + '.currentState';
            linkedstate1  = adapter.namespace + '.ports.' + portNum + '.temperature';
         }

         if ( state ) oldvalue = state.val;
         if ( oldvalue != fnc ) {
            adapter.setState( 'ports.' + portNum + '.func', {val: fnc, ack: true});
            if ( oldvalue ) {
               adapter.log.debug(' -- удаляем у порта '+linkedstate+' функцию ' + oldvalue );
               removeFromEnum( oldvalue, linkedstate  );
               removeFromEnum( oldvalue, linkedstate1 );
               removeFromEnum( 'enum.func', linkedstate  );
               removeFromEnum( 'enum.func', linkedstate1 );
            } 
            if (fnc) {
               adapter.log.debug(' -- добавляем порту '+linkedstate+' функцию ' + fnc );
               addToEnum( fnc, linkedstate );
            }

               adapter.extendObject( linkedstate, {
                                      native: {
                                            function: fnc
                                      }
                                  });
               adapter.extendObject( linkedstate1, {
                                      native: {
                                            function: ''
                                      }
                                  });

            adapter.log.info( 'ports.' + portNum + '.func : '+ oldvalue + ' -> ' + fnc );
         }
      }
   );

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.portType',
      function (err, state ) {
         var oldvalue = "";
         if ( state ) oldvalue = state.val;
         if ( oldvalue != portType ) {
            adapter.setState( 'ports.' + portNum + '.portType', {val: portType, ack: true});
            adapter.log.info( 'ports.' + portNum + '.portType : '+ oldvalue + ' -> ' + portType );
         }
      }
   );

   if ( portType == cPortType_NotConnected ) {
/* ToDO: если порт переводим  в NC - хорошо бы его принудительно выключить xx:0 */
      defaultAction = '';
      defaultRunAlways = false;
      netAction = '';
      netRunOnlyWhenServerOut = false;
      portMode = cPortMode_PressOnly;
      send2ServerAlwaysPressRelease = false;
      tremorDefenceDisabled = false;
      displayPort = '';
      defaultState = false;
      GSMmode = cGSMmodeNo;
      smooth = false;
   }


   adapter.getState( adapter.namespace + '.ports.' + portNum + '.defaultAction',
      function (err, state ) {
         var oldvalue = "";
         if ( state ) oldvalue = state.val;
         if ( oldvalue != defaultAction ) {
            adapter.setState( 'ports.' + portNum + '.defaultAction', {val: defaultAction, ack: true});
            adapter.log.info( 'ports.' + portNum + '.defaultAction : '+ oldvalue + ' -> ' + defaultAction );
         }
      }
   );

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.defaultRunAlways',
      function (err, state ) {
         var oldvalue = "";
         if ( state ) oldvalue = state.val;
         if ( oldvalue != defaultRunAlways ) {
            adapter.setState( 'ports.' + portNum + '.defaultRunAlways', {val: defaultRunAlways, ack: true});
            adapter.log.info( 'ports.' + portNum + '.defaultRunAlways : '+ oldvalue + ' -> ' + defaultRunAlways );
         }
      }
   );

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.netAction',
      function (err, state ) {
         var oldvalue = "";
         if ( state ) oldvalue = state.val;
         if ( oldvalue != netAction ) {
            adapter.setState( 'ports.' + portNum + '.netAction', {val: netAction, ack: true});
            adapter.log.info( 'ports.' + portNum + '.netAction : '+ oldvalue + ' -> ' + netAction );
         }
      }
   );

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.netRunOnlyWhenServerOut',
      function (err, state ) {
         var oldvalue = "";
         if ( state ) oldvalue = state.val;
         if ( oldvalue != netRunOnlyWhenServerOut ) {
            adapter.setState( 'ports.' + portNum + '.netRunOnlyWhenServerOut', {val: netRunOnlyWhenServerOut, ack: true});
            adapter.log.info( 'ports.' + portNum + '.netRunOnlyWhenServerOut : '+ oldvalue + ' -> ' + netRunOnlyWhenServerOut );
         }
      }
   );

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.portMode',
      function (err, state ) {
         var oldvalue = "";
         if ( state ) oldvalue = state.val;
         if ( oldvalue != portMode ) {
            adapter.setState( 'ports.' + portNum + '.portMode', {val: portMode, ack: true});
            adapter.log.info( 'ports.' + portNum + '.portMode : '+ oldvalue + ' -> ' + portMode );
         }
      }
   );

   if ( portMode == cPortMode_ClickMode ) {
      send2ServerAlwaysPressRelease = false;
   }

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.send2ServerAlwaysPressRelease',
      function (err, state ) {
         var oldvalue = "";
         if ( state ) oldvalue = state.val;
         if ( oldvalue != send2ServerAlwaysPressRelease ) {
            adapter.setState( 'ports.' + portNum + '.send2ServerAlwaysPressRelease', {val: send2ServerAlwaysPressRelease, ack: true});
            adapter.log.info( 'ports.' + portNum + '.send2ServerAlwaysPressRelease : '+ oldvalue + ' -> ' + send2ServerAlwaysPressRelease );
         }
      }
   );

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.tremorDefenceDisabled',
      function (err, state ) {
         var oldvalue = "";
         if ( state ) oldvalue = state.val;
         if ( oldvalue != tremorDefenceDisabled ) {
            adapter.setState( 'ports.' + portNum + '.tremorDefenceDisabled', {val: tremorDefenceDisabled, ack: true});
            adapter.log.info( 'ports.' + portNum + '.tremorDefenceDisabled : '+ oldvalue + ' -> ' + tremorDefenceDisabled );
         }
      }
   );

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.displayPort',
      function (err, state ) {
         var oldvalue = "";
         if ( state ) oldvalue = state.val;
         if ( oldvalue != displayPort ) {
            adapter.setState( 'ports.' + portNum + '.displayPort', {val: displayPort, ack: true});
            adapter.log.info( 'ports.' + portNum + '.displayPort : '+ oldvalue + ' -> ' + displayPort );
         }
      }
   );

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.defaultState',
      function (err, state ) {
         var oldvalue = "";
         if ( state ) oldvalue = state.val;
         if ( oldvalue != defaultState ) {
            adapter.setState( 'ports.' + portNum + '.defaultState', {val: defaultState, ack: true});
            adapter.log.info( 'ports.' + portNum + '.defaultState : '+ oldvalue + ' -> ' + defaultState );
         }
      }
   );

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.digitalSensorType',
      function (err, state ) {
         var oldvalue = "";
         if ( state ) oldvalue = state.val;
         if ( oldvalue != digSensorType ) {
            adapter.setState( 'ports.' + portNum + '.digitalSensorType', {val: digSensorType, ack: true});
            adapter.log.info( 'ports.' + portNum + '.digitalSensorType : '+ oldvalue + ' -> ' + digSensorType );
         }
      }
   );

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.digitalSensorMode',
      function (err, state ) {
         var oldvalue = "";
         if ( state ) oldvalue = state.val;
         if ( oldvalue != digSensorMode ) {
            adapter.setState( 'ports.' + portNum + '.digitalSensorMode', {val: digSensorMode, ack: true});
            adapter.log.info( 'ports.' + portNum + '.digitalSensorMode : '+ oldvalue + ' -> ' + digSensorMode );
         }
      }
   );

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.GSMmode',
      function (err, state ) {
         var oldvalue = "";
         if ( state ) oldvalue = state.val;
         if ( oldvalue != GSMmode ) {
            adapter.setState( 'ports.' + portNum + '.GSMmode', {val: GSMmode, ack: true});
            adapter.log.info( 'ports.' + portNum + '.GSMmode : '+ oldvalue + ' -> ' + GSMmode );
         }
      }
   );

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.portOutMode',
      function (err, state ) {
         var oldvalue = "";
         if ( state ) oldvalue = state.val;
         if ( oldvalue != portOutMode ) {
            adapter.setState( 'ports.' + portNum + '.portOutMode', {val: portOutMode, ack: true});
            adapter.log.info( 'ports.' + portNum + '.portOutMode : '+ oldvalue + ' -> ' + portOutMode );
         }
      }
   );

   adapter.getState( adapter.namespace + '.ports.' + portNum + '.group',
      function (err, state ) {
         var oldvalue = "";
         if ( state ) oldvalue = state.val;
         if ( oldvalue != group ) {
            adapter.setState( 'ports.' + portNum + '.group', {val: group, ack: true});
            adapter.log.info( 'ports.' + portNum + '.group : '+ oldvalue + ' -> ' + group );
         }
      }
   );
   
   if ( portType == cPortType_DimmedOut ) {
      adapter.log.debug('*** savePort control point 5 ***');
      if ( portNum == '10' || portNum == '12' || portNum == '13' ) {
         pwmTimer = '1';
      } else if ( portNum == '25' || portNum == '27' || portNum == '28' ) {
         pwmTimer = '3';
      } else if ( portNum == '11' ) {
         pwmTimer = '2';
      } else { 
         // TRAP!
         pwmTimer = '1';
      }

      if ( portOutMode == cOutPortMode_PWM  ) {
         adapter.getState( adapter.namespace + '.PWM.timers.' + pwmTimer + '.freq',
            function (err, state ) {
               var oldvalue = "";
               if ( state ) oldvalue = state.val;
               if ( oldvalue != freq ) {
                  adapter.setState( 'PWM.timers.' + pwmTimer + '.freq', {val: freq, ack: true});
                  adapter.log.info( 'PWM.timers.' + pwmTimer + '.freq : '+ oldvalue + ' -> ' + freq );
               }
            }
         );

         adapter.getState( adapter.namespace + '.ports.' + portNum + '.defaultPWM',
            function (err, state ) {
               var oldvalue = 0;
               if ( state ) oldvalue = state.val;
               if ( oldvalue != defPWM ) {
                  adapter.setState( 'ports.' + portNum + '.defaultPWM', {val: defPWM, ack: true});
                  adapter.log.info( 'ports.' + portNum + '.defaultPWM : '+ oldvalue + ' -> ' + defPWM );
               }
            }
         );

         adapter.getState( adapter.namespace + '.ports.' + portNum + '.smooth',
            function (err, state ) {
               var oldvalue = 0;
               if ( state ) oldvalue = state.val;
               if ( oldvalue != smooth ) {
                  adapter.setState( 'ports.' + portNum + '.smooth', {val: smooth, ack: true});
                  adapter.log.info( 'ports.' + portNum + '.smooth : '+ oldvalue + ' -> ' + smooth );
               }
            }
         );

      } else {
         adapter.setState( 'ports.' + portNum + '.defaultPWM', {val: 0, ack: true});
         adapter.setState( 'ports.' + portNum + '.smooth', {val: false, ack: true});
      }

   } else {
      adapter.setState( 'ports.' + portNum + '.defaultPWM', {val: 0, ack: true});
      adapter.setState( 'ports.' + portNum + '.smooth', {val: false, ack: true});
   }


   //---------- передаем данные в Мегу
   var url = 'pn=' + portNum;
   if ( portType == cPortType_NotConnected ) {
     //pn=4&pty=255&nr=1
      url += '&pty='+cNPortType_NotConnected;
   } else if ( portType == cPortType_StandartIn ) {
      //pn=3&ecmd=10:2&af=&eth=192.168.1.64:90/megad.php?pt=&naf=&misc=&d=&pty=0&m=0&gsmf=1&nr=1
      //url += '&ecmd='+encodeURIComponent((defaultAction || '').trim());
      //url += '&eth='+encodeURIComponent((netAction || '').trim());

      url += '&ecmd='+(defaultAction || '').trim();
      if (defaultRunAlways) {
         url += '&af=1';
      } else {
         url += '&af='; // ?
      }
      url += '&eth='+(netAction || '').trim();
      if (netRunOnlyWhenServerOut) {
         url += '&naf=1';
      } else {
         url += '&naf='; // ?
      }
      if (send2ServerAlwaysPressRelease) {
         url += '&misc=1';
      } else {
         url += '&misc='; // ?
      }
      if (tremorDefenceDisabled) {
         url += '&d=1';
      } else {
         url += '&d='; // ?
      }
      url += '&pty='+cNPortType_StandartIn;
      if ( portMode == cPortMode_PressOnly ) {
         url += '&m=' + cNPortMode_PressOnly;
      } else if ( portMode == cPortMode_PressAndRelease ) {
         url += '&m=' + cNPortMode_PressAndRelease;
      } else if ( portMode == cPortMode_ReleaseOnly ) {
         url += '&m=' + cNPortMode_ReleaseOnly;
      } else if ( portMode == cPortMode_ClickMode ) {
         url += '&m=' + cNPortMode_ClickMode;
      }
      url += '&disp='+displayPort;
      if ( GSMmode == cGSMmodeNo ) {
         url += '&gsmf=0'; 
      } else if ( GSMmode == cGSMmodeAlways ) {
         url += '&gsmf=1'; 
      } else if ( GSMmode == cGSMmodeArmed ) {
         url += '&gsmf=2'; 
      } else {
         url += '&gsmf=0'; // ?
      }

      //url += '&nr=1'; // !! временно


   } else if ( portType == cPortType_ReleOut || portType == cPortType_SimistorOut || portType == cPortType_DimmedOut || portType == cPortType_DS2413 ) {
      //pn=7&grp=&pty=1&d=0&m=0&nr=1
      url += '&grp=' + group; 
      url += '&pty='+cNPortType_Out;
      if ( portOutMode != cOutPortMode_PWM ) {
         if (defaultState) {
            url += '&d=1';
         } else {
            url += '&d='; // ?
         }
      } else {
         url += '&d=' + defPWM;
      }
      if ( portOutMode == cOutPortMode_SW ) {
         url += '&m=0'; 
      } else if ( portOutMode == cOutPortMode_PWM ) {
         url += '&m=1'; 
         if ( freq == cPWM_Freq_Normal ) {
            url += '&fr=0'; 
         } else if ( freq == cPWM_Freq_Low ) {
            url += '&fr=1';
         } else if ( freq == cPWM_Freq_High ) {
            url += '&fr=2';
         }
         if ( smooth ) {
            url += '&misc=1'; // ?
         }
      } else if ( portOutMode == cOutPortMode_DS2413 ) {
         url += '&m=2'; 
      } else if ( portOutMode == cOutPortMode_SWLINK ) {
         url += '&m=3'; 
      } else {
         url += '&m=0'; 
      }

   } else if ( portType == cPortType_DigitalSensor ) {
      //pn=28&misc=0.00&hst=0.00&ecmd=&af=&eth=&naf=&pty=3&m=0&d=3&gsmf=0&nr=1
      url += '&misc=0.00&hst=0.00&ecmd=&af=&eth=&naf='; //!временно
      url += '&pty='+cNPortType_DigitalSensor;
      if ( digSensorMode == 'Norm' ) {
         url += '&m=0';
      } else if ( digSensorMode == '>' ) {
         url += '&m=1';
      } else if ( digSensorMode == '<' ) {
         url += '&m=2';
      } else if ( digSensorMode == '<>' ) {
         url += '&m=3';
      } else  {
         url += '&m=0'; // ?
      }
      if ( digSensorType == cDigitalSensorTypeDS18B20 ) {
         url += '&d=' + cNDigitalSensorTypeDS18B20;
      } else if ( digSensorType == cDigitalSensorTypeDHT11 ) {
         url += '&d=' + cNDigitalSensorTypeDHT11;
      } else if ( digSensorType == cDigitalSensorTypeDHT22 ) {
         url += '&d=' + cNDigitalSensorTypeDHT22;
      } else if ( digSensorType == cDigitalSensorTypeMarine ) {
         url += '&d=' + cNDigitalSensorTypeMarine;
      } else if ( digSensorType == cDigitalSensorType1WBus ) {
         url += '&d=' + cNDigitalSensorType1WBus;
      } else if ( digSensorType == cDigitalSensorTypeWiegand26 ) {
         url += '&d=' + cNDigitalSensorTypeWiegand26;
      }
      url += '&gsmf=0'; //!временно

   } else {
      url += '&pty='+cNPortType_NotConnected;
   }


/*
var cNPortType_Out = '1';           
var cNPortType_DigitalSensor  = '3';
var cNPortType_I2C  = '4';
var cNPortType_AnalogSensor  = '2'; 

      adapter.setState( nodeName + '.defaultState', {val: '', ack: true}); 
      adapter.setState( nodeName + '.digitalSensorType', {val: '', ack: true}); 
*/
    // ----- открываем соединение и передаем данные в Мегу ------------------------------------
    //var parts = adapter.config.ip.split(':');

    var options = {
        host: IP,
        port: IPPort,
        path: '/' + Password +'/?' + url + '&nr=1'
    };

    var options1 = {
        host: IP,
        port: IPPort,
        path: '/' + Password +'/?' + url
    };


    // делаем паузу
    //setTimeout(function () {
      adapter.log.debug('Отправляем новые настройки на Мегу');
      //adapter.log.debug('path->'+path);
      adapter.log.debug('->'+url);
      http.get(options, function (res) {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function (chunk) {
            data += chunk;
        });
        res.on('end', function () {
            adapter.log.debug('Получили ответ Меги:' + data);
            if (res.statusCode != 200) {
                adapter.log.warn('Response code: ' + res.statusCode + ' - ' + data);
                if (obj.callback) {
                   adapter.sendTo(obj.from, obj.command, {error: res.statusCode, response: data}, obj.callback);
                }
            } else {
                //----------------------------------------------
                http.get(options1, function (res1) {
                   res1.setEncoding('utf8');
                   var data1 = '';
                   res1.on('data', function (chunk1) {
                       data1 += chunk1;
                   });
                   res1.on('end', function () {
                      adapter.log.debug('Получили ответ1 Меги:' + data1);
                      if (res1.statusCode != 200) {
                         adapter.log.warn('Response code: ' + res1.statusCode + ' - ' + data1);
                         if (obj.callback) {
                            adapter.sendTo(obj.from, obj.command, {error: res1.statusCode, response: data1}, obj.callback);
                         }
                      } else {
               //------------------------------------------------------------------
                         adapter.log.debug('Пауза для перезапуска Меги ... ');
                         setTimeout(function () {
                            adapter.log.debug('Пауза истекла ... ');
                            if (obj.callback) {
                               adapter.sendTo(obj.from, obj.command, {error: '', response: data1}, obj.callback);
                            }
                         }, 3000);
                      }
                   });
                });
            }
        });
      }).on('error', function (err) {
        adapter.log.error( err );
        if (obj.callback) {
           adapter.sendTo(obj.from, obj.command, {error: err, response: null}, obj.callback);
        }
      });

}


//---------------------------------------------------------------------------------------------
//settings: {
//    "port":   8080,
//    "auth":   false,
//    "secure": false,
//    "bind":   "0.0.0.0", // "::"
//    "cache":  false
//}
function main() {
    adapter.setState('info.connection', false, true);

    configInit( function () {
        //debugAllStates();
        adapter.getState(adapter.namespace + '.controller.ip', function (err, state_ip) {
           if (state_ip) {
              IP = state_ip.val;
           }
           adapter.getState(adapter.namespace + '.controller.ipport', function (err, state_port) {
              if (state_port) {
                 IPPort = state_port.val || 80;
              } else {
                 IPPort = 80;
              }
              adapter.getState(adapter.namespace + '.controller.password', function (err, state_pwd) {
                 if (state_pwd) {
                    Password = state_pwd.val;
                 }
                 adapter.getState(adapter.namespace + '.controller.name', function (err, state_name) {
                    if (state_name) {
                       ControllerName = state_name.val;
                    }
                    adapter.getState(adapter.namespace + '.controller.serverPort', function (err, state_srv) {
                       if (state_srv) {
                          ServerPort = state_srv.val;
                       }
                       adapter.log.debug('IP='+IP);
                       adapter.log.debug('IPPort='+IPPort);
                       adapter.log.debug('Password='+Password);
                       adapter.log.debug('ControllerName='+ControllerName);
                       adapter.log.debug('ServerPort='+ServerPort);
                       //------------------------------------------------------
               
                       if ( IP ) {
                          ServerPort = parseInt( ServerPort, 10) || 0;
                          if ( ServerPort ) {
                          server = require('http').createServer(restApi);
                             adapter.getPort( ServerPort, function (port) {
                                if (port != ServerPort && !adapter.config.findNextPort) {
                                   adapter.log.warn('port ' + ServerPort + ' already in use');
                                } else {
                                   server.listen(port);
                                   adapter.log.info('http server listening on port ' + port);
                                }
                             });
                          } else {
                             adapter.log.info('No port specified');
                          }
                          //getFirmwareVersion();
                       } else {
                          adapter.log.warn('IP is null');
                       }

                       //******************************************************
                       ///??  Filippovsky --- syncObjects();

                       if ( IP && IP != '0.0.0.0') {
                          adapter.log.debug('getFirmwareVersion start');
                          getFirmwareVersion();
                          adapter.log.debug('getFirmwareVersion stop');

                          pollStatus();
                          adapter.getState( adapter.namespace + '.controller.pollInterval', function (err, state) {
                             if ( state.val && state.val > 0 ) {
                                setInterval(pollStatus, state.val * 1000);
                             }
                          });
                       } else {
                          adapter.log.warn('IP is null or 0.0.0.0');
                       }

                       adapter.subscribeStates('*');
                       processMessages(true);
                    });
                 });
              });
           });
        });
    });

}
//-------------------------------------------------------------------------------------------------------
/*
function readLink(link, callback) {
    if (link.match(/^https?:\/\//)) {
        request = request || require('request');

        adapter.log.debug('Request URL: ' + link);
        request(link, function (error, response, body) {
            callback(!body ? error || JSON.stringify(response) : null, body, link);
        });
    } else {
        path = path || require('path');
        fs   = fs   || require('fs');
        link = link.replace(/\\/g, '/');
        if (link[0] !== '/' && !link.match(/^[A-Za-z]:/)) {
            link = path.normalize(__dirname + '/../../' + link);
        }
        adapter.log.debug('Read file: ' + link);
        if (fs.existsSync(link)) {
            var data;
            try {
                data = fs.readFileSync(link);
            } catch (e) {
                adapter.log.error('Cannot read file "' + link + '": ' + e);
                callback(e, null, link);
                return;
            }
            callback(null, data, link);
        } else {
            callback('File does not exist', null, link);
        }
    }
}
*/
//------------------------------------------------------------------------------------------------
function readCfgFromMega ( obj ) {
    var filename = 'last.cfg';
    adapter.log.debug( 'readCfgFromMega start' );
    adapter.log.debug( 'IP = ' + IP );
    if (IP && IP != '0.0.0.0') {
       readMegaConfig2File( filename, function( err ) {
          if ( err ) {
             adapter.log.error( err );
             if (obj.callback) adapter.sendTo( obj.from, obj.command, {error: err}, obj.callback);
          } else {
             // читаем настройки из файла
             ReadFileMegaConfig( filename, function( err, data ) {
                if ( err ) {
                   adapter.log.error( err );
                   if (obj.callback) adapter.sendTo( obj.from, obj.command, {error: err}, obj.callback);
                } else {
                   //adapter.log.debug( data );
                   if (obj.callback) {
                      adapter.sendTo(obj.from, obj.command, {error: err, response: data}, obj.callback);
                   }
                }
             });
          }          
      });
    } else {
        adapter.log.debug( 'IP is null' );
        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: 'invalid address'}, obj.callback);
    }
}
//------------------------------------------------------------------------
/*
function getXPmodel ( numXP ) {
   var Ret  = cXPModelNone ;
   var name = '';
   if ( numXP == 1 || numXP == '1' ) {
      name = 'controller.xp1model';
   } else if ( numXP == 2 || numXP == '2' ) {
      name = 'controller.xp2model';
   } else {
      return cXPModelNone;
   }

   adapter.getState( name, function (err, state) {
      if ( state ) Ret = state.value;
      return Ret;
   });
   adapter
   return Ret;
}
*/
//--------------------------------------------------------------------------
/*
function isPortTypeCorrect ( portXPNum, numXP, portType ) {
// portXPnum  - порт конкретного исполнительного модуля, начиная с 0
   var name;
   var xpModel;

   if ( numXP == 1 || numXP == '1' ) {
      name = 'controller.xp1model';
   } else if ( numXP == 2 || numXP == '2' ) {
      name = 'controller.xp2model';
   } else {
      name = 'control';
   }

   if ( name !== 'control' ) {
      adapter.getState( name, { return function (err, state) {
          if ( !state ) return false;
          xpModel = state.val;
          if ( portType == cPortType_NotConnected ) return true;
          switch ( xpModel ) {
             case cXPModelNone:
                if ( portType <> cPortType_NotConnected ) return false;
                break;

             case cXPModel7I7OR:
                if ( portXPNum > 13 ) return false;
                if ( portXPNum < 7 ) {
                   if ( portType == cPortType_StandartIn ) {
                      return true;
                   } else {
                      return false;
                   }
                } else {
                    if ( portType == cPortType_ReleOut ) {
                       return true;
                    } else {
                       return false;
                    }
                }

             case cXPModel7I7OSD:
                if ( portXPNum > 13 ) return false;
                if ( portXPNum < 7 ) {
                   if ( portType == cPortType_StandartIn ) {
                      return true;
                   } else {
                      return false;
                   }
                } else if ( portXPNum == 10 || portXPNum == 12 || portXPNum == 13 ) {
                   if ( portType == cPortType_DimmedOut ) {
                      return true;
                   } else {
                      return false;
                   }
                } else {
                    if ( portType == cPortType_SimistorOut ) {
                       return true;
                    } else {
                       return false;
                    }
                }

             case cXPModel8I7OS:
                if ( portXPNum > 14 ) return false;
                if ( portXPNum < 7 ) {
                   if ( portType == cPortType_StandartIn ) {
                      return true;
                   } else {
                      return false;
                   }
                } else if ( portXPNum < 14 ) {
                   if ( portType == cPortType_SimistorOut ) {
                      return true;
                   } else {
                      return false;
                   }
                } else {
                    if ( portType == cPortType_DigitalSensor ) {
                       return true;
                    } else {
                       return false;
                    }
                }


             case cXPModel8I7OSD:
                if ( portXPNum > 14 ) return false;
                if ( portXPNum < 7 ) {
                   if ( portType == cPortType_StandartIn ) {
                      return true;
                   } else {
                      return false;
                   }
                } else if ( portXPNum == 10 || portXPNum == 12 || portXPNum == 13 ) {
                   if ( portType == cPortType_DimmedOut ) {
                      return true;
                   } else {
                      return false;
                   }
                } else if ( portXPNum < 14 ) {
                   if ( portType == cPortType_SimistorOut ) {
                      return true;
                   } else {
                      return false;
                   }
                } else {
                    if ( portType == cPortType_DigitalSensor ) {
                       return true;
                    } else {
                       return false;
                    }
                }

             case cXPModel14In:
                if ( portXPNum > 13 ) return false;
                if ( portType == cPortType_StandartIn ) return true;
                if ( portType == cPortType_DigitalSensor ) return true;
                if ( portType == cPortType_I2C ) return true;
                if ( portXPNum <= 5 ) {
                   if ( portType == cPortType_AnalogSensor ) {
                      return true;
                   }
                } 
                return false;
                break;

             case cXPModel14R1:
                if ( portXPNum > 13 ) return false;
                if ( portType == cPortType_ReleOut ) return true;
                return false;
                break;

             case cXPModel14R2:
                if ( portXPNum > 14 ) return false;
                if ( portXPNum < 14 ) {
                   if ( portType == cPortType_ReleOut ) return true;
                } else {
                   if ( portType == cPortType_DigitalSensor ) return true;
                }
                return false;
                break;

             case cXPModel2R:
                if ( portXPNum > 1 ) return false;
                if ( portType == cPortType_ReleOut ) return true;
                return false;
                break;

             default:
                    return false;
          }
        }
      });

   } else {
     // control
     if ( portXPNum < 36 ) {
        if ( portType == cPortType_DigitalSensor ) return true;
        if ( portType == cPortType_I2C ) return true;
        return false;
     } else {
        if ( portType == cPortType_AnalogSensor ) return true;
        return false;
     }
   }
}
*/
//---------------------------------------------------------------------------
/*
function ptyNum2Char( ptyNum ) {
   switch (ptyNum) {
      case cNPortType_NotConnected: return cPortType_NotConnected;
      case cNPortType_StandartIn:   return cPortType_StandartIn;

var cNPortType_Out = '1';           
var cNPortType_DigitalSensor  = '3';
var cNPortType_I2C  = '4';
var cNPortType_AnalogSensor  = '2'; 


var cPortType_NotConnected = 'NotConnected'; //255
var cPortType_StandartIn  = 'StandartIn';    //0
var cPortType_ReleOut = 'ReleOut';           //1
var cPortType_DimmedOut = 'DimmedOut'; //1
var cPortType_SimistorOut = 'SimistorOut'; //1
var cPortType_DigitalSensor  = 'DigitalSensor'; //3 цифровой вход dsen
var cPortType_I2C  = 'I2C'; // 4 
var cPortType_AnalogSensor  = 'AnalogSensor'; // 2 АЦП-вход для аналоговых датчиков

*/
//----------------------------------------------------------------------------------------------
/*
function saveAdmin(obj) {
   var lc = new Date().getTime();
   var linked   = adapter.namespace + '.' + obj.message.key;
   //adapter.log.debug( 'linked =  '+linked );

   adapter.extendObject( linked, {
                                    val: obj.message.val,
                                    ack: true,
                                    lc:  lc,
                                    ts:  ts
                                  });
}

*/
//-------------------------------------------------------------------------------
function writecf2mega ( obj ) {
   adapter.getStates('*', function(err,states) {
      var x = JSON.stringify(states); 
      var setup = JSON.parse( x );
      var inst = 'megadjt.' + adapter.instance + '.';
      //adapter.log.debug('>> '+ Setup['megadjt.0.ports.0.room'].val );
      // cf=1&eip=192.168.0.15&pwd=sec&gw=192.168.0.1&sip=192.168.1.35:91&sct=/0&pr=&gsm=1&gsm_num=79165499627&smst=3&srvt=0
      // cf=2&mdid=5Q7g7&sl=1&nr=1
      var url1 = 'cf=1&eip=' + setup[ inst + 'controller.ip'].val + '&pwd=' + setup[ inst + 'controller.password'].val;
      var gw = setup[ inst + 'controller.gateway'].val;
      if ( gw == '' ) {
         url1 += '&gw=255.255.255.255';
      } else {
         url1 += '&gw=' + gw;
      }
      var sip = setup[ inst + 'controller.serverIP'].val;
      if ( sip == '' ) {
         url1 += '&sip=255.255.255.255:80';
      } else {
         url1 += '&sip=' + sip + ':' + setup[ inst + 'controller.serverPort'].val;
      }
      url1 += '&sct=' + setup[ inst + 'controller.script'].val;
      url1 += '&pr=' + setup[ inst + 'controller.watchDogPort'].val;
      if ( setup[ inst + 'gsm.enabled'].val == true ) {
         url1 += '&gsm=1';
         url1 += '&gsm_num=' +  setup[ inst + 'gsm.phone'].val;
         url1 += '&smst='    +  setup[ inst + 'gsm.timeout'].val;
      } else {
         //url1 += '&gsm=0&gsm_num=&smst=';//?
         url1 += '&gsm_num=&smst=';//?
      }
      if ( setup[ inst + 'controller.serverType'].val == 'MQTT' ) {
         url1 += '&srvt=1';
      } else {
         url1 += '&srvt=0';//??
      }
      var url2 = 'cf=2';
      url2 += '&mdid=' + setup[ inst + 'controller.name'].val;
      if ( setup[ inst + 'controller.srvLoop'].val == true ) {
         url2 += '&sl=1';
      } else {
         //url2 += '&sl=';
         url2 += '';
      }

      // ----- открываем соединение и передаем данные в Мегу ------------------------------------
 
      var options1 = {
          host: IP,
          port: IPPort,
          path: '/' + Password +'/?' + url1 + '&nr=1'
      };

      var options2 = {
        host: IP,
        port: IPPort,
        path: '/' + Password +'/?' + url2
     };

     adapter.log.debug('Отправляем новые настройки на Мегу');
     adapter.log.debug('->'+url1);
     http.get(options1, function (res) {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function (chunk) {
            data += chunk;
        });
        res.on('end', function () {
           adapter.log.debug('Получили ответ Меги:' + data);
           if (res.statusCode != 200) {
              adapter.log.warn('Response code: ' + res.statusCode + ' - ' + data);
              if (obj.callback) {
                 adapter.sendTo(obj.from, obj.command, {error: res.statusCode, response: data}, obj.callback);
              }
           } else {
              //----------------------------------------------
              http.get(options2, function (res1) {
                 res1.setEncoding('utf8');
                 var data1 = '';
                 res1.on('data', function (chunk1) {
                     data1 += chunk1;
                 });
                 res1.on('end', function () {
                    adapter.log.debug('Получили ответ1 Меги:' + data1);
                    if (res1.statusCode != 200) {
                       adapter.log.warn('Response code: ' + res1.statusCode + ' - ' + data1);
                       if (obj.callback) {
                          adapter.sendTo(obj.from, obj.command, {error: res1.statusCode, response: data1}, obj.callback);
                       }
                    } else {
                       adapter.log.debug('Пауза для перезапуска Меги ... ');
                       setTimeout(function () {
                          adapter.log.debug('Пауза истекла ... ');
                          if (obj.callback) {
                             adapter.sendTo(obj.from, obj.command, {error: '', response: data1}, obj.callback);
                          }
                       }, 3000);
                    }
                 });
              });
           }
        });
     }).on('error', function (err) {
        adapter.log.error( err );
        if (obj.callback) {
           adapter.sendTo(obj.from, obj.command, {error: err, response: null}, obj.callback);
        }
     });
  });
}


