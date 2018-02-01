'use strict';

const apiai = require('apiai');
const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('uuid');
const request = require('request');
const JSONbig = require('json-bigint');
const async = require('async');
const url = require('url');
//firebase 
var firebase = require('firebase');
var parseString = require('xml2js').parseString;
//cofiguracion conexion firebase
var config = {
    apiKey: process.env.FBASE_APIKEY, //"AIzaSyCsVB58GbuUmkwSSv4WAlk3FOuU786IrEg",
    authDomain: process.env.AUTH_DOMAIN, //"cocacola-redphone.firebaseapp.com",
    databaseURL: process.env.DATABASE_URL, //"https://cocacola-redphone.firebaseio.com",
    projectId: process.env.PROJECT_ID, //"cocacola-redphone",
    storageBucket: "",
    messagingSenderId: process.env.MESSAGING_SERNDER_ID //"634647561747"
};
var defaultApp = firebase.initializeApp(config);
var db = firebase.database();
const REF_ALTA = process.env.REF_ALTA;
const REF_ALTA_DATA = process.env.REF_ALTA_DATA;
const REF_RETO = process.env.REF_RETO;
//geolocalizacion inverza 
var NodeGeocoder = require('node-geocoder');
var options = {
    provider: 'google',

    // Optional depending on the providers
    httpAdapter: 'https', // Default
    apiKey: 'AIzaSyCsVB58GbuUmkwSSv4WAlk3FOuU786IrEg', // for Mapquest, OpenCage, Google Premier
    formatter: null // 'gpx', 'string', ...
};

var geocoder = NodeGeocoder(options);


const REST_PORT = (process.env.PORT || 5000);
const APIAI_ACCESS_TOKEN = process.env.APIAI_ACCESS_TOKEN;
const APIAI_LANG = process.env.APIAI_LANG || 'en';
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const FB_TEXT_LIMIT = 640;

const FACEBOOK_LOCATION = "FACEBOOK_LOCATION";
const FACEBOOK_WELCOME = "FACEBOOK_WELCOME";

//----funcion demo monte ws-----------
function consultaClienteWS(sender, idcontrato) {
    console.log('InvocarWS Monte');
    console.log('idcontrato: ', idcontrato);
    if (idcontrato === 'undefined' || idcontrato === null) {
        return "";
    }
    return new Promise((resolve, reject) => {
        request({
            url: 'http://189.254.131.9:8080/NMP/GestionMovilRS/FlexibleUpdateWorkOrder',
            method: 'POST',
            json: {
                "Action": "Estatus_Solicitudes",
                "IdWorkOrder": "eb6e14bb-936b-4480-b3f1-ba6f2cb23cca",
                "WorkOrderType": "Consulta_Solicitudes",
                "Username": "ICMUNOZ",
                "ExternalId": "gmoralesb_20160226_134446",
                "IdWorkOrderFormType": "0d7032d7-2477-44a1-a14c-20ec2c704283",
                "InputFields": {
                    "tipo_busqueda": "Por_Cliente",
                    "Num_Cliente": "3897896",
                    "ExternalType": "Consulta_Solicitudes"
                }
            }
        }, (error, response) => {
            if (error) {
                console.log('Error sending message: ', error);
                reject(error);
            } else if (response.body.error) {
                console.log('Error: ', response.body.error);
                reject(new Error(response.body.error));
            }
            console.log('WS Monte -- response.body:', response.body);
            var resSting = JSON.stringify(response.body);
            var newstr = resSting.substring(resSting.indexOf("</Saldo_Fecha>"));
            var ini = newstr.indexOf("<Saldo_Fecha>") + 13;
            var fin = ini + 8;
            console.log('ini: ', ini);
            console.log('fin: ', fin);
            var s = newstr.substring(ini, fin);
            console.log('Saldo_Fecha= ', s);
            let messageData = {
                text: 'su adeudo es de ' + s
            }
            sendAlertaReto(sender, messageData);

            resolve();
        });
    });

    function sendAlertaReto(sender, messageData) {
        console.log('sendFBMessage sender =', sender);
        return new Promise((resolve, reject) => {
            request({
                url: 'https://graph.facebook.com/v2.6/me/messages',
                qs: { access_token: FB_PAGE_ACCESS_TOKEN },
                method: 'POST',
                json: {
                    recipient: { id: sender },
                    message: messageData,
                }
            }, (error, response) => {
                if (error) {
                    console.log('Error sending message: ', error);
                    reject(error);
                } else if (response.body.error) {
                    console.log('Error: ', response.body.error);
                    reject(new Error(response.body.error));
                }

                resolve();
            });
        });
    }
}

//grabar usuario en arbol usuarios (registro completo)
function guardarAlta(idusr, fechaAtaFin) {
    //arbol usurios
    console.log('guardar ALta ');
    try {
        var db = firebase.database();
        var ref = db.ref(REF_ALTA);
        //var newRef = ref.push();
        var newRef = ref.child(idusr);
        newRef.child("fb_id").set(idusr).then(function(data) {
            console.log('Firebase data: ', data);
        })
        grabardatosAlta(idusr, 'fechaActualizacion', fechaAtaFin);
        return null;
    } catch (err) {
        console.log('err ', err);
        return null;
    }
}

//--guadar datos alta en fire base 
function grabardatosAlta(idusr, contexto, contextoValor) {
    console.log("conectando a FireBase");
    console.log("idusr: ", idusr);
    console.log("contexto: ", contexto);
    console.log("contextoValor: ", contextoValor);
    console.log('defaultApp.name: ' + defaultApp.name); // "[DEFAULT]"
    // arbol datos registro
    try {
        var db = firebase.database();
        var ref = db.ref(REF_ALTA_DATA)
        var newRef = ref.child(idusr);
        newRef.child("fb_id").set(idusr).then(function(data) {
            console.log('Firebase data: ', data);
        })
        newRef.child(contexto).set(contextoValor).then(function(data) {
            console.log('Firebase data: ', data);
        })
        return null;
    } catch (err) {
        console.log('err ', err);
        return null;
    }
}
//----- fin guardar datos alta fire base 

//funcion que envia a usuarios registrados mensaje para iniciar un reto------------------------ 
function solicitudReto(nombre, texto, fecha, hora) {
    console.log('Inicia Solicitud Reto');
    console.log('nombre reto: ', nombre);
    console.log('texto: ', texto);
    console.log('fecha Reto:', fecha);
    console.log('Hora Reto:', hora);
    var ref = db.ref(REF_ALTA);
    var count = 0;
    let messageData = {
        "text": texto,
        "quick_replies": [{
                "content_type": "text",
                "title": "SI",
                "payload": nombre + '-SI',
            },
            {
                "content_type": "text",
                "title": "NO",
                "payload": nombre + '-NO'
            }
        ]
    }

    function asyncSqrt(ref, callback) {
        try {
            var contador = 0;
            console.log('START execution');
            ref.on("value", function(snap) {
                snap.forEach(function(childSnap) {
                    var reg = childSnap.val();
                    console.log('registro= ', reg.fb_id);
                    sendAlertaReto(reg.fb_id, messageData);
                    contador++;
                })
                callback(null, contador);
            });
        } catch (err) {
            console.log('err ', err);
            return contador;
        }
    }

    function sendAlertaReto(sender, messageData) {
        console.log('sendFBMessage sender =', sender);
        return new Promise((resolve, reject) => {
            request({
                url: 'https://graph.facebook.com/v2.6/me/messages',
                qs: { access_token: FB_PAGE_ACCESS_TOKEN },
                method: 'POST',
                json: {
                    recipient: { id: sender },
                    message: messageData,
                }
            }, (error, response) => {
                if (error) {
                    console.log('Error sending message: ', error);
                    reject(error);
                } else if (response.body.error) {
                    console.log('Error: ', response.body.error);
                    reject(new Error(response.body.error));
                }

                resolve();
            });
        });
    }
    asyncSqrt(ref, function(ref, result) {
        console.log('Enviado a =', result + ' Usuarios registrados');
        grabarInfoReto(fecha, hora, result, nombre);
    });
}
//-----------------------------------------------
//--guadar datos de los retos en firebase 
function grabardatosContexto(idusr, contexto, contextoValor, idreto, flagconcat) {
    console.log("conectando a FireBase");
    console.log("idusr: ", idusr);
    console.log("contexto: ", contexto);
    console.log("contextoValor: ", contextoValor);
    console.log("idreto: ", idreto);
    console.log('defaultApp.name: ' + defaultApp.name); // "[DEFAULT]"
    // arbol retos respuestas
    if (contextoValor == 'undefined' || contextoValor == null) {
        console.log('-sin contexto-');
        return null;
    }
    try {
        var db = firebase.database();
        //--------------------
        var ref = db.ref(REF_RETO)
        var newRefReto = ref.child(idreto);
        var RefRespuestas = newRefReto.child("respuestas");
        var newRefUsr = RefRespuestas.child(idusr);
        newRefUsr.child("fb_id").set(idusr).then(function(data) {
                console.log('Firebase data: ', data);
            })
            //concat contexto valor
        console.log('flagconcat: ', flagconcat);
        if (flagconcat == true) {
            var refConcat = db.ref(REF_RETO + idreto + '/respuestas/' + idusr + '/' + contexto + '/')
            refConcat.once("value", function(snapshot) {
                console.log('contexto anterior: ', snapshot.val());
                if (snapshot.val()) {
                    var contextoValor2 = snapshot.val() + ',' + contextoValor;
                    console.log('contextoValor concat: ', contextoValor2);
                    newRefUsr.child(contexto).set(contextoValor2).then(function(data) {
                        console.log('Firebase data: ', data);
                    })
                } else {
                    newRefUsr.child(contexto).set(contextoValor).then(function(data) {
                        console.log('Firebase data: ', data);
                    })
                }
            });
        } else {
            newRefUsr.child(contexto).set(contextoValor).then(function(data) {
                console.log('Firebase data: ', data);
            })
        }
        return null;
    } catch (err) {
        console.log('err ', err);
        return null;
    }
}
//----- fin guardar datos retos 

//--guadar informacion del reto 
function grabarInfoReto(fecha, hora, invitaciones, idreto) {
    idreto = idreto.toLowerCase();
    console.log("conectando a FireBase");
    console.log("fecha: ", fecha);
    console.log("hora: ", hora);
    console.log("invitaciones: ", invitaciones);
    console.log("idreto: ", idreto);
    console.log('defaultApp.name: ' + defaultApp.name); // "[DEFAULT]"
    // arbol datos registro
    try {
        var db = firebase.database();
        var ref = db.ref(REF_RETO)
        var newRefReto = ref.child(idreto);
        var RefDatos = newRefReto.child("datos");
        RefDatos.child("idReto").set(idreto).then(function(data) {
            console.log('Firebase data: ', data);
        })
        RefDatos.child("fechaEnvio").set(fecha).then(function(data) {
            console.log('Firebase data: ', data);
        })
        RefDatos.child("horaEnvio").set(hora).then(function(data) {
            console.log('Firebase data: ', data);
        })
        RefDatos.child("cantidadInvitados").set(invitaciones).then(function(data) {
            console.log('Firebase data: ', data);
        })
        return null;
    } catch (err) {
        console.log('err ', err);
        return null;
    }
}
//----- fin guardar infoReto

function grabarRetoFin(sender, idreto, fechaFin) {
    console.log('grabar fin reto ');
    console.log('idusr: ', sender);
    console.log('idReto: ', idreto);
    var db = firebase.database();
    var ref = db.ref(REF_RETO)
    var newRefReto = ref.child(idreto);
    var RefCon = newRefReto.child("concluidas");
    var RefDetalle = RefCon.child(sender);
    RefDetalle.child("fb_id").set(sender).then(function(data) {
            console.log('Firebase data: ', data);
        })
        //conultar alrbol /usuarios/datos
    var ref2 = db.ref(REF_ALTA_DATA + sender + "/");
    ref2.on("value", function(snap) {
        snap.forEach(function(childSnap) {
            console.log('childSnap.val= ', childSnap.val());
            console.log('childSnap.key= ', childSnap.key);
            RefDetalle.child(childSnap.key).set(childSnap.val())
        })
        RefDetalle.child('fechaActualizacion').set(fechaFin)
    });
    incrementarReto(idreto);
}
//funcion que actualiza la cantidad de retos contestados en base al reto 
function incrementarReto(idreto) {
    console.log('llamada  inclemetar reto ');
    console.log('idreto: ', idreto);
    try {
        //consultar
        var db = firebase.database();
        var ref = db.ref(REF_RETO + idreto + '/datos/cantidadrespuestas/')
        ref.once("value", function(snapshot) {
            let cRespuestas = snapshot.val();
            console.log('Cantidad Respuestas', snapshot.val());
            if (snapshot.val()) {
                //sumar
                console.log('Sumar');
                cRespuestas = cRespuestas + 1;
                console.log('cRespuestas:', cRespuestas);
                var refSUMA = db.ref(REF_RETO + idreto + '/datos/')
                refSUMA.child('cantidadrespuestas').set(cRespuestas)
            } else {
                console.log('agregar cantidadrespuestas');
                var refSUMA = db.ref(REF_RETO + idreto + '/datos/')
                refSUMA.child('cantidadrespuestas').set(1)
            }
        });

    } catch (err) {
        console.log('err ', err);
    }
}

//funcion para convertir hora UTC a mexico
function fechaMexico(fbTimeStamp) {
    try {
        var t = new Date(fbTimeStamp);
        t.setHours(t.getHours() - 6);
        var arrDate = t.toJSON().split("T");
        var hora = arrDate[1].split(".")
        console.log('Fecha: ', arrDate[0]);
        console.log('Hora:', hora[0]);
        return [arrDate[0], hora[0]];

    } catch (err) {
        console.log('err ', err);
        return null;
    }
}
class FacebookBot {
    constructor() {
        this.apiAiService = apiai(APIAI_ACCESS_TOKEN, { language: APIAI_LANG, requestSource: "fb" });
        this.sessionIds = new Map();
        this.messagesDelay = 200;
    }

    doDataResponse(sender, facebookResponseData) {
        if (!Array.isArray(facebookResponseData)) {
            console.log('Response as formatted message');
            this.sendFBMessage(sender, facebookResponseData)
                .catch(err => console.error(err));
        } else {
            async.eachSeries(facebookResponseData, (facebookMessage, callback) => {
                if (facebookMessage.sender_action) {
                    console.log('Response as sender action');
                    this.sendFBSenderAction(sender, facebookMessage.sender_action)
                        .then(() => callback())
                        .catch(err => callback(err));
                } else {
                    console.log('Response as formatted message');
                    this.sendFBMessage(sender, facebookMessage)
                        .then(() => callback())
                        .catch(err => callback(err));
                }
            }, (err) => {
                if (err) {
                    console.error(err);
                } else {
                    console.log('Data response completed');
                }
            });
        }
    }

    doRichContentResponse(sender, messages) {
        let facebookMessages = []; // array with result messages

        for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
            let message = messages[messageIndex];

            switch (message.type) {
                //message.type 0 means text message
                case 0:
                    // speech: ["hi"]
                    // we have to get value from fulfillment.speech, because of here is raw speech
                    if (message.speech) {
                        let splittedText = this.splitResponse(message.speech);
                        // message.speech contiene el texto del mensaje 
                        console.log('message.speech: ' + message.speech);
                        splittedText.forEach(s => {
                            facebookMessages.push({ text: s });
                        });
                    }

                    break;
                    //message.type 1 means card message
                case 1:
                    {
                        let carousel = [message];

                        for (messageIndex++; messageIndex < messages.length; messageIndex++) {
                            if (messages[messageIndex].type == 1) {
                                carousel.push(messages[messageIndex]);
                            } else {
                                messageIndex--;
                                break;
                            }
                        }

                        let facebookMessage = {};
                        carousel.forEach((c) => {
                            // buttons: [ {text: "hi", postback: "postback"} ], imageUrl: "", title: "", subtitle: ""

                            let card = {};

                            card.title = c.title;
                            card.image_url = c.imageUrl;
                            if (this.isDefined(c.subtitle)) {
                                card.subtitle = c.subtitle;
                            }
                            //If button is involved in.
                            if (c.buttons.length > 0) {
                                let buttons = [];
                                for (let buttonIndex = 0; buttonIndex < c.buttons.length; buttonIndex++) {
                                    let button = c.buttons[buttonIndex];

                                    if (button.text) {
                                        let postback = button.postback;
                                        if (!postback) {
                                            postback = button.text;
                                        }

                                        let buttonDescription = {
                                            title: button.text
                                        };

                                        if (postback.startsWith("http")) {
                                            buttonDescription.type = "web_url";
                                            buttonDescription.url = postback;
                                        } else {
                                            buttonDescription.type = "postback";
                                            buttonDescription.payload = postback;
                                        }

                                        buttons.push(buttonDescription);
                                    }
                                }

                                if (buttons.length > 0) {
                                    card.buttons = buttons;
                                }
                            }

                            if (!facebookMessage.attachment) {
                                facebookMessage.attachment = { type: "template" };
                            }

                            if (!facebookMessage.attachment.payload) {
                                facebookMessage.attachment.payload = { template_type: "generic", elements: [] };
                            }

                            facebookMessage.attachment.payload.elements.push(card);
                        });

                        facebookMessages.push(facebookMessage);
                    }

                    break;
                    //message.type 2 means quick replies message
                case 2:
                    {
                        if (message.replies && message.replies.length > 0) {
                            let facebookMessage = {};

                            facebookMessage.text = message.title ? message.title : 'Choose an item';
                            facebookMessage.quick_replies = [];

                            message.replies.forEach((r) => {
                                facebookMessage.quick_replies.push({
                                    content_type: "text",
                                    title: r,
                                    payload: r
                                });
                            });

                            facebookMessages.push(facebookMessage);
                        }
                    }

                    break;
                    //message.type 3 means image message
                case 3:

                    if (message.imageUrl) {
                        let facebookMessage = {};

                        // "imageUrl": "http://example.com/image.jpg"
                        facebookMessage.attachment = { type: "image" };
                        facebookMessage.attachment.payload = { url: message.imageUrl };

                        facebookMessages.push(facebookMessage);
                    }

                    break;
                    //message.type 4 means custom payload message
                case 4:
                    if (message.payload && message.payload.facebook) {
                        facebookMessages.push(message.payload.facebook);
                    }
                    break;

                default:
                    break;
            }
        }

        return new Promise((resolve, reject) => {
            async.eachSeries(facebookMessages, (msg, callback) => {
                    this.sendFBSenderAction(sender, "typing_on")
                        .then(() => this.sleep(this.messagesDelay))
                        .then(() => this.sendFBMessage(sender, msg))
                        .then(() => callback())
                        .catch(callback);
                },
                (err) => {
                    if (err) {
                        console.error(err);
                        reject(err);
                    } else {
                        console.log('Messages sent');
                        resolve();
                    }
                });
        });

    }

    doTextResponse(sender, responseText) {
        console.log('Response as text message');
        // facebook API limit for text length is 640,
        // so we must split message if needed
        let splittedText = this.splitResponse(responseText);

        async.eachSeries(splittedText, (textPart, callback) => {
            this.sendFBMessage(sender, { text: textPart })
                .then(() => callback())
                .catch(err => callback(err));
        });
    }

    //which webhook event
    getEventText(event) {
        console.log('getEventText event: ', event);
        if (event.message) {
            if (event.message.quick_reply && event.message.quick_reply.payload) {
                return event.message.quick_reply.payload;
            }
            if (event.message.attachments) {
                if (event.message.attachments[0].type) {
                    if (event.message.attachments[0].type === 'image') {
                        return event.message.attachments[0].payload.url;
                    }
                }

            }
            //iniciar proceso del alta del usuario
            if (event.message.text) {
                if (event.message.text == "Alta") {
                    console.log('return cod-alta');
                    return 'cod-alta';
                }
                /*console.log('event.message.text.indexOf(Lanzar-)', event.message.text.indexOf('Lanzar-'));
                if (event.message.text.indexOf('Lanzar-') === 0) {
                    var dateMX = fechaMexico(event.timestamp);
                    console.log('dateMX=', dateMX);
                    //---------
                    var arr1 = event.message.text.split("-", 2);
                    console.log('arr1: ', arr1);
                    console.log('llamando solicitudReto');
                    solicitudReto(arr1[1], dateMX[0], dateMX[1]);
                    return null;
                }*/
                return event.message.text;
            }
        }

        if (event.postback && event.postback.payload) {
            return event.postback.payload;
        }

        return null;

    }

    getFacebookEvent(event) {
        if (event.postback && event.postback.payload) {

            let payload = event.postback.payload;

            switch (payload) {
                case FACEBOOK_WELCOME:
                    return { name: FACEBOOK_WELCOME };

                case FACEBOOK_LOCATION:
                    return { name: FACEBOOK_LOCATION, data: event.postback.data }
            }
        }

        return null;
    }

    processFacebookEvent(event) {
        //se deshabilita el envio de ubicaciones por corrdenadas a api ai y se cambian por texto
        if (event.postback.payload === "FACEBOOK_LOCATION") {
            return null;
        }
        const sender = event.sender.id.toString();
        const eventObject = this.getFacebookEvent(event);
        if (eventObject) {

            // Handle a text message from this sender
            if (!this.sessionIds.has(sender)) {
                this.sessionIds.set(sender, uuid.v4());
            }

            let apiaiRequest = this.apiAiService.eventRequest(eventObject, {
                sessionId: this.sessionIds.get(sender),
                originalRequest: {
                    data: event,
                    source: "facebook"
                }
            });
            this.doApiAiRequest(apiaiRequest, sender);
        }
    }

    processMessageEvent(event) {
        const sender = event.sender.id.toString();
        const text = this.getEventText(event);
        if (text) {

            // Handle a text message from this sender
            if (!this.sessionIds.has(sender)) {
                this.sessionIds.set(sender, uuid.v4());
            }
            //console.log("sender: ", sender);
            //console.log("Text: ", text);
            //send user's text to api.ai service
            let apiaiRequest = this.apiAiService.textRequest(text, {
                sessionId: this.sessionIds.get(sender),
                originalRequest: {
                    data: event,
                    source: "facebook"
                }
            });

            this.doApiAiRequest(apiaiRequest, sender);
        }
    }

    doApiAiRequest(apiaiRequest, sender) {
        console.log('apiaiRequest: ', apiaiRequest);
        apiaiRequest.on('response', (response) => {
            if (this.isDefined(response.result) && this.isDefined(response.result.fulfillment)) {
                let responseText = response.result.fulfillment.speech;
                let responseData = response.result.fulfillment.data;
                let responseMessages = response.result.fulfillment.messages;
                //recuperando datos del request de api ai 
                console.log('response: ', response);
                //console.log('doApiAiRequest response.result ', response.result);
                //console.log('response.result.fulfillment.messages: ', response.result.fulfillment.messages);
                //console.log('doApiAiRequest sender: ', sender);
                //console.log('response.result.metadata.intentName: ', response.result.metadata.intentName);
                //console.log('response.result.parameters ', response.result.parameters);
                //console.log('response.sessionId: ', response.sessionId);
                //proceso alta 
                response.result.contexts.forEach(function(value) {
                    console.log('value: ', value);
                    var arr1 = value.name.split("-", 3);
                    if (value.lifespan == 1) {
                        console.log('doApiAiRequest sender: ', sender);
                        console.log('response.result.parameters: ', response.result.parameters);
                        console.log('response.result.parameters.valor: ', response.result.parameters.valor);
                        console.log('contexto: ', value.name);
                        //grabar el fin del proceso de alta 
                        if (value.name === 'alta-fin') {
                            var fechaAtaFin = response.timestamp.substr(0, 10);
                            guardarAlta(sender, fechaAtaFin);
                        }
                        //grabar datos alta
                        if (response.result.parameters.valor != 'undefined' && response.result.parameters.valor != null && arr1[0] === 'alta' && arr1[1] != 'fin') {
                            grabardatosAlta(sender, arr1[1], response.result.parameters.valor);
                        }
                        //es un reto 
                        if (value.name.indexOf('alta') < 0 && value.name.indexOf('fin') < 0 && value.name.indexOf('99-') < 0) {
                            console.log('invocar guadar datos contexto ');
                            //guardar url de la foro en base al valor response.result.resolvedQuery
                            console.log('arr1[1].indexOf foto: ', arr1[1].indexOf('foto'));
                            console.log('response.result.resolvedQuery: ', response.result.resolvedQuery);
                            if (arr1[1].indexOf('foto') >= 0) {
                                grabardatosContexto(sender, arr1[1], response.result.resolvedQuery, arr1[0], false);
                            } else {
                                if (arr1[2] && arr1[2] == 'acumula') {
                                    console.log('-------------acumular contexto----------------');
                                    grabardatosContexto(sender, arr1[1], response.result.parameters.valor, arr1[0], true);
                                } else {
                                    grabardatosContexto(sender, arr1[1], response.result.parameters.valor, arr1[0], false);
                                }
                            }
                        }
                        if (value.name.indexOf('99-reto-mensaje') === 0 && sender == '1472770199476303') {
                            console.log('value.parameters: ', value.parameters);
                            console.log('value.parameters.reto:', value.parameters.reto);
                            console.log('value.parameters.mensaje: ', value.parameters.mensaje);
                            var t = new Date(response.timestamp);
                            t.setHours(t.getHours() - 6);
                            var fechareto = t.toISOString().replace('T', ' ').substr(0, 19);
                            var arrFecha = fechareto.split(' ', 2);
                            solicitudReto(value.parameters.reto, value.parameters.mensaje, arrFecha[0], arrFecha[1]);
                        }
                    }
                    /*---Demo WS Monte -------------------------
                    if (value.lifespan == 2) {
                        if (value.name === 'reto13-deuda') {
                            console.log('response.result.parameters.valor: ', response.result.parameters.valor);
                            console.log('value.parameters.valor: ', value.parameters.valor);
                            consultaClienteWS(sender, response.result.parameters.valor);
                        }
                    }
                    //----end demo ws monte --------------------*/
                    console.log('value.name.indexOf -fin:', value.name.indexOf('-fin'));
                    if (value.name.indexOf('-fin') > 0 && value.name != 'alta-fin') {
                        var arr2 = value.name.split("-", 2);
                        var t = new Date(response.timestamp);
                        t.setHours(t.getHours() - 6);
                        var fechafin = t.toISOString().replace('T', ' ').substr(0, 19);
                        grabarRetoFin(sender, arr2[0], fechafin);
                    }
                });
                if (this.isDefined(responseData) && this.isDefined(responseData.facebook)) {
                    let facebookResponseData = responseData.facebook;
                    this.doDataResponse(sender, facebookResponseData);
                } else if (this.isDefined(responseMessages) && responseMessages.length > 0) {
                    this.doRichContentResponse(sender, responseMessages);
                } else if (this.isDefined(responseText)) {
                    this.doTextResponse(sender, responseText);
                }

            }
        });

        apiaiRequest.on('error', (error) => console.error(error));
        apiaiRequest.end();
    }

    splitResponse(str) {
        if (str.length <= FB_TEXT_LIMIT) {
            return [str];
        }

        return this.chunkString(str, FB_TEXT_LIMIT);
    }

    chunkString(s, len) {
        let curr = len,
            prev = 0;

        let output = [];

        while (s[curr]) {
            if (s[curr++] == ' ') {
                output.push(s.substring(prev, curr));
                prev = curr;
                curr += len;
            } else {
                let currReverse = curr;
                do {
                    if (s.substring(currReverse - 1, currReverse) == ' ') {
                        output.push(s.substring(prev, currReverse));
                        prev = currReverse;
                        curr = currReverse + len;
                        break;
                    }
                    currReverse--;
                } while (currReverse > prev)
            }
        }
        output.push(s.substr(prev));
        return output;
    }

    sendFBMessage(sender, messageData) {
        return new Promise((resolve, reject) => {
            request({
                url: 'https://graph.facebook.com/v2.6/me/messages',
                qs: { access_token: FB_PAGE_ACCESS_TOKEN },
                method: 'POST',
                json: {
                    recipient: { id: sender },
                    message: messageData
                }
            }, (error, response) => {
                if (error) {
                    console.log('Error sending message: ', error);
                    reject(error);
                } else if (response.body.error) {
                    console.log('Error: ', response.body.error);
                    reject(new Error(response.body.error));
                }

                resolve();
            });
        });
    }

    sendFBSenderAction(sender, action) {
        return new Promise((resolve, reject) => {
            request({
                url: 'https://graph.facebook.com/v2.6/me/messages',
                qs: { access_token: FB_PAGE_ACCESS_TOKEN },
                method: 'POST',
                json: {
                    recipient: { id: sender },
                    sender_action: action
                }
            }, (error, response) => {
                if (error) {
                    console.error('Error sending action: ', error);
                    reject(error);
                } else if (response.body.error) {
                    console.error('Error: ', response.body.error);
                    reject(new Error(response.body.error));
                }

                resolve();
            });
        });
    }

    doSubscribeRequest() {
        request({
                method: 'POST',
                uri: `https://graph.facebook.com/v2.6/me/subscribed_apps?access_token=${FB_PAGE_ACCESS_TOKEN}`
            },
            (error, response, body) => {
                if (error) {
                    console.error('Error while subscription: ', error);
                } else {
                    console.log('Subscription result: ', response.body);
                }
            });
    }

    configureGetStartedEvent() {
        request({
                method: 'POST',
                uri: `https://graph.facebook.com/v2.6/me/thread_settings?access_token=${FB_PAGE_ACCESS_TOKEN}`,
                json: {
                    setting_type: "call_to_actions",
                    thread_state: "new_thread",
                    call_to_actions: [{
                        payload: FACEBOOK_WELCOME
                    }]
                }
            },
            (error, response, body) => {
                if (error) {
                    console.error('Error while subscription', error);
                } else {
                    console.log('Subscription result', response.body);
                }
            });
    }

    isDefined(obj) {
        if (typeof obj == 'undefined') {
            return false;
        }

        if (!obj) {
            return false;
        }

        return obj != null;
    }

    sleep(delay) {
        return new Promise((resolve, reject) => {
            setTimeout(() => resolve(), delay);
        });
    }

}


let facebookBot = new FacebookBot();

const app = express();

app.use(bodyParser.text({ type: 'application/json' }));

app.get('/webhook/', (req, res) => {
    if (req.query['hub.verify_token'] === FB_VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);

        setTimeout(() => {
            facebookBot.doSubscribeRequest();
        }, 3000);
    } else {
        res.send('Error, wrong validation token');
    }
});

app.post('/webhook/', (req, res) => {
    try {
        const data = JSONbig.parse(req.body);
        console.log("req = <--" + JSON.stringify(data) + '-->');
        if (data.entry) {
            let entries = data.entry;
            entries.forEach((entry) => {
                let messaging_events = entry.messaging;
                if (messaging_events) {
                    messaging_events.forEach((event) => {
                        if (event.message && !event.message.is_echo) {
                            let flagGeoCoder = false;
                            if (event.message.attachments) {
                                let locations = event.message.attachments.filter(a => a.type === "location");
                                // delete all locations from original message
                                //event.message.attachments = event.message.attachments.filter(a => a.type !== "location");
                                if (locations.length > 0) {
                                    //gelocalizacion inversa
                                    flagGeoCoder = true;
                                    geocoder.reverse({ lat: event.message.attachments[0].payload.coordinates.lat, lon: event.message.attachments[0].payload.coordinates.long.toString() })
                                        .then(function(res) {
                                            console.log('zipcode: ', res[0].zipcode);
                                            // delete all locations from original message
                                            event.message.attachments[0] = []; //event.message.attachments.filter(a => a.type !== "location");
                                            // se añade codigo postal como texto del mesaje 
                                            event.text = res[0].zipcode;
                                            event.message.text = res[0].zipcode;
                                        })
                                        .then(function() {
                                            facebookBot.processMessageEvent(event);
                                            return null;
                                        })
                                        .catch(function(err) {
                                            console.log(err);
                                        });
                                    //fin geolocalizacion inversa 
                                    locations.forEach(l => {
                                        let locationEvent = {
                                            sender: event.sender,
                                            postback: {
                                                payload: "FACEBOOK_LOCATION",
                                                data: l.payload.coordinates
                                            }
                                        };

                                        facebookBot.processFacebookEvent(locationEvent);
                                    });
                                }
                            }
                            console.log('flagGeoCoder: ', flagGeoCoder);
                            if (flagGeoCoder == false) {
                                facebookBot.processMessageEvent(event);
                            }
                        } else if (event.postback && event.postback.payload) {
                            if (event.postback.payload === "FACEBOOK_WELCOME") {
                                console.log('FACEBOOK_WELCOME');
                                facebookBot.processFacebookEvent(event);
                            } else {
                                console.log('event.postback && event.postback.payload');
                                facebookBot.processMessageEvent(event);
                            }
                        }
                    });
                }
            });
        }

        return res.status(200).json({
            status: "ok"
        });
    } catch (err) {
        return res.status(400).json({
            status: "error",
            error: err
        });
    }

});

app.listen(REST_PORT, () => {
    console.log('Rest service ready on port ' + REST_PORT);
});

facebookBot.doSubscribeRequest();