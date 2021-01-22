// API URL
const API_URL = "https://api.bedrockwireless.com/";

// credentials -- you should probably load these from somewhere secure
// Your account gives you access to the API.  
// You can create a new account for api access and share your caps 
// with that account if you want to be fancy
// Please do not share the demo account information
const credentials = {"email":"INSERT_HERE","password":"INSERT_HERE"};

// Standard headers for API calls
const headers = {'Content-Type':'application/json','accept':'application/json'};

function getConfig(token) {
    return {headers:{...headers,Authorization:`Bearer ${token}`}};
}

// Login to API -- You need an access token to make most API calls
const loginToAPI = async () => {
    return new Promise((resolve, reject) => {
        axios.post(API_URL+"users/login",credentials,{headers:headers})
        .then(response => {
            resolve(response.data);
        }).catch(error => {
            reject(error);
        });
    });
}

// Get User information and cap access information
const getUserAndCapInfo = async (data) => {
    return new Promise((resolve,reject) => {
        axios.get(API_URL+"users/me",getConfig(data.token))
        .then(response => {
            resolve(response.data);
        }).catch(error => {
            reject(error);
        });
    })
}

// Get monitor (camera at a specific resolution) information, which is used to request images
const getMonitorData = async (data,capId) => {
    return new Promise((resolve,reject) => {
        axios.get(API_URL+`caps/${capId}/standardMonitors`,getConfig(data.token))
        .then(response => {
            resolve(response.data);
        }).catch(error => {
            reject(error);
        });
    });
}

// Get live images from the cap
// This has to pull over LTE, so be gentle
// We ask that you don't call this more than once per 30 seconds
const getLiveImages = async (data,capId,monitors,token=null) => {
    const package = {ids:monitors};
    if(token) {
        package.token=token;
    }
    return new Promise((resolve,reject) => {
        axios.post(API_URL+`caps/${capId}/live`,package,getConfig(data.token))
        .then(response => {
            resolve(response.data);
        }).catch(error => {
            if(error.response.status===504) {
                console.log("CAP Unit is unavailable")
                resolve(null);
            } else {
                reject(error);
            }
        });
    });
}

// Get stale images from the cloud
// This will pull the latest available image
// Useful for when the CAP loses LTE signal
// or when there's a power outage
// Or when you just need a recent image (and not a live one)
const getStaleImages = async (data,capId,monitorId) => {
    return new Promise((resolve,reject) => {
        axios.get(API_URL+`caps/${capId}/latest/${monitorId}`,getConfig(data.token))
        .then(response => {
            resolve(response.data);
        }).catch(error => {
            reject(error);
        })
    })
}

// Filter Monitors by Name
// Names: House, Driveway, Neighbor, Street
const filterMonitors = (monitors,desired) => {
    var i = monitors.length;
    while(i--) {
        if(monitors[i].name.split('_')[0]!==desired) {
            monitors.splice(i,1);
        }
    }
    return monitors;
}

// combines login and user metadata
const getMetadata = async () => {
    const credentials = await loginToAPI();
    const cap = await getUserAndCapInfo(credentials);
    // console.log(cap);
    return new Promise((resolve, reject) => {
        if(!cap || !credentials) {
            reject("Could not fetch metadata");
        }
        resolve({...cap,...credentials});
    });
}

let metadata = null;
let capId = null;
let monitorData = null;
let desiredMonitor = null;
let camToken = null;
getMetadata().then(response => {
    metadata = response;
    // Grab the first capId from the caps list that the user has access to as an example
    // Could use any cap the user has access to
    // Demo account only has access to TNAH
    capId = Object.keys(metadata.caps)[1];
    getMonitorData(metadata,capId).then(response2 => {
        monitorData = response2;
        // We just want the house image
        // Could get the Neighbor, Driveway, or Street Image depending on what you want 
        // (or all 4)
        monitorData = filterMonitors(monitorData,"House");
        desiredMonitor = monitorData[0].monitorId

        // Load the latest image by default and load live images on an interval (below)
        getStaleImages(metadata,capId,desiredMonitor).then(response4 => {
            console.log(response4);
            document.getElementById("BedrockWirelessCAPFeed").src = response4.url;
            document.getElementById("imgDate").innerHTML = "Loaded image from: "+new Date(response4.captureDate);
        }).catch(error => console.log(error));
    }).catch(error => console.log(error));
}).catch(error => console.log(error));

// Please be nice to our API, we're a young company
// API will let you call this fast (still working on rate-limiting)
// LTE capacity is limited
// We ask that you load only once per 30 seconds and to only load
// when someone is viewing it (i.e. do not setup a backgroung service)
let imageInterval = 30000; // 30 seconds
let imgRefresher = setInterval(() => {
    if(monitorData && metadata && capId) {
        getLiveImages(metadata,capId,monitorData,camToken).then(response => {
            if(response) {
                document.getElementById("BedrockWirelessCAPFeed").src = response.body[desiredMonitor].url;
                document.getElementById("imgDate").innerHTML = "LIVE!"
                // Store token for cameras so img requests go faster on
                // subsequent requests
                camToken = response.token;
            } 
        });
    }
},imageInterval)
// Stop loading new images after 5 minutes b/c who looks at a web page that long?
// they can always refresh to restart the cycle
let stalePageTimeout = 300000; // 5 minutes
setTimeout(() => clearInterval(imgRefresher),stalePageTimeout);
