
var jsforce = require('jsforce');
const axios = require('axios');

//parameters to listen to event
var channel = process.env.PEChannel || '/event/SendToSAP__e';

var user = process.env.SFUserName || 'rajesh@herodev.org';
var password = process.env.SFPwdAndToken;
console.log(password);
var replayId = -1;
var interfaceName = process.env.InterfaceName || 'SAPInterface';

//parameters to publish response
var responsechannel = process.env.PEResponseChannel || 'SAPResponse__e';

//parameters to call SOAP service
var url = process.env.SFUrl || 'https://api.ipify.org?format=json';


//listen to published events
var conn = new jsforce.Connection({});
conn.login(user,password,function(err, userInfo){
    if (err) {return console.log(err);}
    console.log("login successful");
    //get replay Id by querying interface tracker object
    conn.query("select Id,Last_Replay_Id__c from Integration_Tracker__c where name = '" + interfaceName + "' order by Last_replay_id__c desc limit 1", function(err, result){
        if (err){return console.error(err);}
        if (result.records){
            console.log(result.records);
            replayId = parseInt(result.records[0].Last_Replay_Id__c);
            var integTrackerId = result.records[0].Id;

            //create streaming client
            var client = conn.streaming.createClient([
                new jsforce.StreamingExtension.Replay(channel, replayId),
                new jsforce.StreamingExtension.AuthFailure(
                    function() {
                        return process.exit(1);
                    }
                )
            ]);
            console.log("client created" + client);
            //subscribe to platform event to listen to events getting published
            try{
              var subscription = client.subscribe(channel, function(message){
                  console.log(message.event.replayId);
                  console.log(message.payload.Message__c);
                  var CelciusObj = message.payload.Message__c;
                  console.log(typeof(CelciusObj));


                  //call rest api for testing
                  axios
                    .get(url)
                    .then(res => {
                      console.log(`statusCode: ${res.status}`);
                      console.log(res.data.ip);

                      conn.sobject(responsechannel).create({ResponseMessage__c : res.data.ip, RequestReplayId__c : message.event.replayId},function(err,ret){
                          console.log("record created " + ret.success);
                      });
                      //update processed replay id on integration tracker
                      conn.sobject("Integration_Tracker__c").insert({Name: interfaceName,Last_Replay_Id__c: message.event.replayId},function(err, rec){
                          if (err || !rec.success) {return console.error(err,rec);}
                          console.log("tracker updated");
                      })


                    })
                    .catch(error => {
                      console.error(error);

                    });
              });
            }
            catch(error){
              console.log(error);
            }

        }
    } );
});
