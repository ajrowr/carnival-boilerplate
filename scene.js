
/* 
"Concrete" refers to the scene subclass created by the developer.
"Framework" refers to things in the framework which you shouldn't override :)

Initialisation procedure for a Scene:
- User code sets window.vrScene to a new instance of the Scene class
-   concrete scene constructor is run
-   concrete constructor MUST do FCScene.call(this) to call the framework scene constructor!
-   constructor completes its various tasks, mostly setting up basic instance data which will be used by later stages of the setup
- FCEngine is loaded by the HTML (eg <script src="/fc_engine.js"), and looks for the scene as window.vrScene
-   calls framework method init(), passing it the GL instance and (if applicable) the stage parameters
-   calls framework method setup() method
-       calls framework method loadPrerequisites(), which autoloads items configured in scene.prerequisites 
-       calls optional concrete method setPrereqs(), which handles any other tasks which must be entirely completed prior to scene setup. This must
        return a promise that will resolve once its job is done; the next steps will not begin until this promise resolves.
-       calls concrete method setupScene(), which actually builds the scene. setupScene can rely on all prerequisites loaded in the previous steps
        being available. You can use asynchronous constructs in setupScene, eg to load JSON feeds and other remote resources; the idea is to get 
        the basic scene visible as quick as possible; having things that "pop into" the scene is generally preferable to making the user wait a 
        long time before seeing anything.
*/

window.ExperimentalScene = (function () {
    "use strict";
    
    var DEG = function (deg) {return deg*(Math.PI/180)}; /* Convert degrees to radians, very handy */
    
    function Scene() {
        FCScene.call(this); /* << Don't remove this! */
        
        var scene = this; /* << Not compulsory but a good habit to have. */
        
        /* Declare any class and instance vars unique to this scene, here. */
        /* This constructor is called before the machinery of the engine is fully initialised, so this is the right place for */
        /* configuration that doesn't depend on other parts of the system, and declaring instance vars which will be filled in later. */

        /* Prerequisites are items that will be loaded before the scene setup. The ones defined here will */
        /* be automatically loaded, and scene setup will be forced to wait until they finish loading, so */
        /* anything fundamental to the initialization of the scene should be considered a prerequisite. */
        /* However it is not ideal to make the user wait for too long so be wary of using large */
        /* downloads as prerequisistes. */
        /* Each of the items in scene.prerequisites will be mapped into scene.<thingtype>.<label> once built. */
        /* (Except for colors which are actually just simple textures are are mapped into scene.textures.<label>) */
        scene.prerequisites = {
            shaders: [
                /* Basic is very simple and doesn't take lighting into account */
                {label: 'basic', 
                 srcVertexShader: '//assets.meta4vr.net/shader/basic.vs', 
                 srcFragmentShader: '//assets.meta4vr.net/shader/basic.fs'},
                
                /* Diffuse is a fairly straightforward shader; static directional lights = no setup required and nearly */
                /* impossible to break */
                {label: 'diffuse', 
                 srcVertexShader: '//assets.meta4vr.net/shader/diffuse2.vs', 
                 srcFragmentShader: '//assets.meta4vr.net/shader/diffuse2.fs'},
                
                /* ADS is Ambient Diffuse Specular; a fairly flexible & decent quality shader which supports */
                /* up to 7 positional lights, and materials. Needs to be setup correctly tho otherwise you */
                /* won't see much of anything. All the materials and lights are configured with ADS in mind. */
                /* NB. specular doesn't work properly yet (see ads_v1.vs for explanation) so YMMV. */
                {label: 'ads',
                 srcVertexShader: '//assets.meta4vr.net/shader/ads_v1.vs', 
                 srcFragmentShader: '//assets.meta4vr.net/shader/ads_v1.fs'}
            ],
            meshes: [
                {label: 'controller_body', src: '//assets.meta4vr.net/mesh/sys/vive/controller/vr_controller_lowpoly/body.obj'},
                {label: 'controller_button_menu', src: '//assets.meta4vr.net/mesh/sys/vive/controller/vr_controller_lowpoly/button.obj'},
                {label: 'controller_button_sys', src: '//assets.meta4vr.net/mesh/sys/vive/controller/vr_controller_lowpoly/sys_button.obj'},
                {label: 'controller_trigger', src: '//assets.meta4vr.net/mesh/sys/vive/controller/vr_controller_lowpoly/trigger.obj'},
                {label: 'controller_trackpad', src: '//assets.meta4vr.net/mesh/sys/vive/controller/vr_controller_lowpoly/trackpad.obj'},
                {label: 'controller_grip_l', src: '//assets.meta4vr.net/mesh/sys/vive/controller/vr_controller_lowpoly/l_grip.obj'},
                {label: 'controller_grip_r', src: '//assets.meta4vr.net/mesh/sys/vive/controller/vr_controller_lowpoly/r_grip.obj'}
            ],
            colors: [
                {hex: '#00007f', label: 'navy'},
                {hex: '#0000ff', label: 'blue'},
                {hex: '#007f00', label: 'green'},
                {hex: '#007f7f', label: 'teal'},
                {hex: '#00ff00', label: 'lime'},
                {hex: '#00ff7f', label: 'springgreen'},
                {hex: '#00ffff', label: 'cyan'},
                {hex: '#00ffff', label: 'aqua'},
                {hex: '#191970', label: 'dodgerblue'},
                {hex: '#20b2aa', label: 'lightseagreen'},
                {hex: '#228b22', label: 'forestgreen'},
                {hex: '#2e8b57', label: 'seagreen'},
                {hex: '#4169e1', label: 'royalblue'},
                {hex: '#ff0000', label: 'red'},
                {hex: '#ff00ff', label: 'magenta'},
                {hex: '#ffa500', label: 'orange'},
                {hex: '#ffff00', label: 'yellow'},
                {hex: '#000000', label: 'black'},
                {hex: '#888888', label: 'gray'},
                {hex: '#ffffff', label: 'white'},
                {r:0.2, g:0.9, b:0.6, label: 'controllerGreen'},
                {r:0.2, g:0.6, b:0.9, label: 'controllerBlue'}
                
            ],
            textures: [
                {label: 'concrete01', src: '//assets.meta4vr.net/texture/concrete01.jpg'}
            ],
            materials: [
                {label: 'concrete', textureLabel: 'concrete01', shaderLabel: 'ads', 
                    ambient:[1,1,1], diffuse:[0.5,0.5,0.5]},
                {label: 'matteplastic', textureLabel: 'white', shaderLabel: 'ads', 
                    ambient:[0,0,0], diffuse:[0.8, 0.8, 0.8]}
            ]
        }
        
        /* A good general pattern for lights is to have a bright white diffuse one overhead of the scene origin */
        /* (ie. the center of the player's starting stage) and then some dimmer, lower-set diffuse ones to */
        /* illuminate the back sides of things. It really depends on where in the scene you expect the player to */
        /* be spending their time. */
        /* Ambient is not very useful in a low-texture environment as it washes out the polygons of any non-flat */
        /* surfaces so it's best to save it for flat things like floors and walls. */
        scene.lightPool = {
            plainWhiteAmbientOverhead: {
                position: [0.0, 3.0, 1.0, 1.0],
                ambient: [0.5, 0.5, 0.5],
                diffuse: [0.8, 0.8, 0.7],
                specular: [0.0, 0.0, 0.0]
            },
            blueBackfill: {
                position: [0.0, 3.0, 5.0, 1.0],
                ambient: [0.0, 0.0, 0.0],
                diffuse: [0.2, 0.2, 0.8],
                specular: [0.0, 0.0, 0.0]
            },
            dimWhiteBackfill: {
                position: [0.0, 3.0, -5.0, 1.0],
                ambient: [0.0, 0.0, 0.0],
                diffuse: [0.2, 0.2, 0.2],
                specular: [0.0, 0.0, 0.0]
            }
        }
        /* All specular components in the default lights are switched off due to the aforementioned */
        /* shader issues with specular. */
        
            
        scene.lights = [
            this.lightPool.plainWhiteAmbientOverhead,
            {position: [-2, 2, 0, 0], diffuse: [0.0, 0.0, 0.8]},
            {position: [2, 2, 0, 0], diffuse: [0.0, 0.8, 0.0]},
            {position: [0, 2, 0, 0], diffuse: [0.8, 0.0, 0.0]},
        ];
        /* If you ever want to change the lighting of the scene while it's rendering, */
        /* call scene.updateLighting() after changing scene.lights - this will */
        /* re-bind the lights to the shader uniforms. */
        /* You can also bind specific lights to individual positions in the shader */
        /* with scene.bindLightToShaderPosition(lightDef, shader, lightIdx). */
        /* To bind a set of lights at once use scene.bindLightsToShader([lightDef, ...], shader). This */
        /* replaces all current lights. */
        /* To switch lights off you can provide a value of null to these methods. */
        /* Note that lights don't need to be in the lightPool to use them - it's */
        /* just for convenience. You can have lights be just as dynamic as you'd like, */
        /* as long as the shader uniforms are kept up to date. */
        
        /* Keep in mind that only certain shaders support lights and materials, none of this */ 
        /* will have any effect on the diffuse or basic shaders for instance. */
        
        /* Occasionally we want things to track the motion of the controllers. */
        /* To make this simple, we'll pre-configure behaviour functions to handle this, and place them */
        /* in scene.trackers. */
        scene.trackers = {a:null, b:null};
        
        /* Toggle to show or hide the lights for debugging */
        scene.lightsShown = false;
        
        
    }
    
    Scene.prototype = Object.create(FCScene.prototype);
    
    Scene.prototype.setupPrereqs = function () {
        return new Promise(function (resolve, reject) {resolve()});
        
        /* NB: NONE OF THIS WILL BE EXECUTED since this function already returned. */
        /* setupPrereqs used to be very important but nowadays most things can be loaded */
        /* automatically by specifying scene.prerequisites in the scene constructor. */
        /* However since it makes for good examples I've left a few bits and pieces in here. */
        
        var scene = this;
        var prereqPromises = [];
        return new Promise(function (resolve, reject) {

            /* Load textures */
            var textures = [
                {src: '//assets.meta4vr.net/texture/concrete01.jpg', label: 'concrete01'}
            ];
            for (var i=0; i<textures.length; i++) {
                var myTex = textures[i];
                prereqPromises.push(scene.addTextureFromImage(myTex.src, myTex.label));
            }
            
            /* Build solid colour textures */
            var texColors = [
                {hex: '#000000', label: 'black'},
                {hex: '#888888', label: 'gray'},
                {hex: '#ffffff', label: 'white'}
            ];
            for (var i=0; i<texColors.length; i++) {
                var myTexColor = texColors[i];
                scene.addTextureFromColor(myTexColor, myTexColor.label);
            }
                        
            /* Load meshes */
            var meshes = [
                {src: '//assets.meta4vr.net/mesh/obj/sys/vive/controller/ctrl_lowpoly_body.obj', label: 'controller'}
            ];
            for (var i=0; i<meshes.length; i++) {
                var myMesh = meshes[i];
                prereqPromises.push(new Promise(function (resolve, reject) {
                    FCShapeUtils.loadObj(myMesh.src)
                    .then(function (mesh) {
                        scene.meshes[myMesh.label] = mesh;
                        resolve();
                    })
                }))
            }
        
            /* Load shaders */
            var shaders = [
                {srcFs: '//assets.meta4vr.net/shader/basic.fs', srcVs: '//assets.meta4vr.net/shader/basic.vs', label: 'basic'},
                {srcFs: '//assets.meta4vr.net/shader/diffuse2.fs', srcVs: '//assets.meta4vr.net/shader/diffuse2.vs', label: 'diffuse'}
            ];
            for (var i=0; i<shaders.length; i++) {
                var myShader = shaders[i];
                prereqPromises.push(scene.addShaderFromUrlPair(myShader.srcVs, myShader.srcFs, myShader.label, {
                    position: 0,
                    texCoord: 1,
                    vertexNormal: 2                
                }));
            }
            
            /* Wait for everything to finish and resolve() */
            Promise.all(prereqPromises).then(function () {
                resolve();
            });
            
        })
        
    }
    
    Scene.prototype.teleportUserToCursor = function () {
        var curs = this.getObjectByLabel('cursor');
        this.moveRaftAndPlayerTo(curs.pos);
    }
    
    /* Helpful for debugging lights */
    /* Pass true to switch lights on, false to switch them off, or nothing (undefined) to toggle their state */
    Scene.prototype.showLights = function (state) {
        var lamps = [];
        state = state || (state === undefined && !this.lightsShown);
        this.lightsShown = state;
        this.removeObjectsInGroup('lamps');
        if (state) {
            for (var i=0; i<this.lights.length; i++) {
                var myLight = this.lights[i];
                if (!(myLight.diffuse && myLight.position)) continue;
                var tex = this.addTextureFromColor({r:myLight.diffuse[0], g:myLight.diffuse[1], b:myLight.diffuse[2]});
                var c = new FCShapes.SimpleCuboid(
                    {x:myLight.position[0], y:myLight.position[1], z:myLight.position[2]},
                    {w:0.3, h:0.3, d:0.3},
                    null, {texture:tex, shaderLabel:'basic', groupLabel:'lamps'}
                );
                lamps.push(c);
                this.addObject(c);
            }
        }
        return lamps;
    }
    
    Scene.prototype.setupScene = function () {
        var scene = this;
        var _hidden = function () {return {x:0, y:-100, z:0};}
        
        console.log('setting up');
        
        /* Cursor */
        var cursor = new FCShapes.SimpleCuboid(
            _hidden(),
            {w: 0.3, h:0.3, d:0.3},
            null,
            {label: 'cursor', materialLabel:'matteplastic', textureLabel: 'red'}
        );
        /* Make the cursor revolve slowly */
        cursor.behaviours.push(function (drawable, timePoint) {
            drawable.currentOrientation = {x:0.0, y:Math.PI*2*(timePoint/7000), z:0.0};
        });
        scene.addObject(cursor);
        
        /* Floor */
        var floor = new FCShapes.WallShape(
            {x: 0, z: 0, y: -0.02},
            {minX: -20, maxX: 20, minY: -20, maxY: 20},
            {x:DEG(270), y:0, z:0},
            {label: 'floor', materialLabel:'concrete', segmentsX: 10, segmentsY: 10}
        );
        /* We use the floor collider to determine where the user is pointing their controller, and hence, */
        /* the location for the cursor. There are two stages to this, first is setting up the collider. */
        /* Note the planeNormal - this is the normal of the floor *before it is rotated into position*. */
        /* Basically any planar collider has to match the original state of an object before that object */
        /* is transformed. */
        /* This is perhaps counterintuitive and may change. Colliders generally are not as easy to use, yet, */
        /* as I would like. */
        var floorCollider = new FCUtil.PlanarCollider({planeNormal:[0, 0, -1], pointOnPlane:[0,0,0]}, floor, null);
        floorCollider.callback = function (dat) {
            var c = scene.getObjectByLabel('cursor');
            c.pos.x = dat.collisionPoint[0];
            c.pos.y = dat.collisionPoint[1];
            c.pos.z = dat.collisionPoint[2];
        }
        scene.addObject(floor);
        
        /* Raft */
        var stageExtent = {
            x: scene.stageParams.sizeX / 2,
            z: scene.stageParams.sizeZ / 2
        };
        console.log(scene.stageParams);
        scene.addObject(new FCShapes.WallShape(
            {x: 0, z: 0, y: 0},
            {minX: -1*stageExtent.x, maxX: stageExtent.x, minY: -1*stageExtent.z, maxY: stageExtent.z},
            {x:DEG(270), y:0, z:0},
            {label: 'raft', materialLabel: 'concrete', textureLabel: 'royalblue', segmentsX: 1, segmentsY: 1}
        ));
        
        /* === === === Controllers === === === */
        
        /* Button handler for the controllers. The default button handler does 3 things: */
        /* 1). Teleport to cursor location when grip button is pressed */
        /* 2). Toggle showing the lights when menu button is pressed */
        /* 3). Output button status info when any button is pressed */
        /* Buttons for Vive controller are - 0: trackpad, 1: trigger 2: grip, 3: menu */
        /* Statuses are: pressed, released, up, held */
        /* up means button is not pressed. */
        /* pressed means the button transitioned from up to down. */
        /* released means the button transitioned from down to up. */
        /* held means the button started down and stayed down */
        /* If the trackpad is involved, sector will be one of n, ne, e, se, s, sw, w, nw, center */
        /* If you need more precision than that, consider writing a custom handler :) */
        /* Buttonhandlers are called once per anim frame. */
        var buttonHandler = function (gamepadIdx, btnIdx, btnStatus, sector, myButton, extra) {
            if (btnStatus != 'up') {
                console.log('Button idx', btnIdx, 'on controller', gamepadIdx, 'was', btnStatus);
                if (btnIdx == 0) {
                    console.log('Sector', sector);
                }
                else if (btnIdx == 3 && btnStatus == 'pressed') {
                    scene.showLights();
                }
                else if (btnIdx == 2 && btnStatus == 'pressed') {
                    scene.teleportUserToCursor();
                }
            }
        };
        
        /* 
        A representation of a controller consists of several distinct pieces of visual chrome, and
        some functions that handle the following tasks:
            - mapping movement of the real-world controller onto the position and orientation of the models
            - interpreting presses of buttons
            - (controller 0) projecting a ray from the controller which "collides" with the floor to determine cursor location
        */
        
        /* Build a pair of simple trackers and add them to the scene for later re-use. */
        scene.trackers.a = FCUtil.makeGamepadTracker(scene, 0, null);
        scene.trackers.b = FCUtil.makeGamepadTracker(scene, 1, null);
                
        /* Factory function for controllers */
        /* primaryBehaviors are specific behaviors that will only be applied to the first item of chrome. */
        /* basicTracker is a simple tracker that just moves the chrome around. */
        var buildController = function (chromeMeshes, texLabel, basicTracker, primaryBehaviors) {
            var p = {
                textureLabel: texLabel, materialLabel: 'matteplastic', groupLabel: 'controllerTrackers'
            };
            for (var i = 0; i < chromeMeshes.length; i++) {
                var o = new FCShapes.MeshShape(chromeMeshes[i], _hidden(), {scale:1}, null, p);
                if (i==0) {
                    for (var j = 0; j < primaryBehaviors.length; j++) {
                        o.behaviours.push(primaryBehaviors[j]);
                    }
                }
                else {
                    o.behaviours.push(basicTracker);
                }
                scene.addObject(o);
            }
        }
        
        var chromeMeshes = (function (L) {var out=[]; for (var i=0; i<L.length; i++) {out.push(scene.meshes['controller_'+L[i]]);} return out;})
            (['body', 'button_menu', 'button_sys', 'trigger', 'trackpad', 'grip_l', 'grip_r']);
        
        /* */
        var c0ButtonHandlingTracker = FCUtil.makeGamepadTracker(scene, 0, buttonHandler);
        var c0Projector = FCUtil.makeControllerRayProjector(scene, 0, [floorCollider]);
        var c1ButtonHandlingTracker = FCUtil.makeGamepadTracker(scene, 1, buttonHandler);        
        
        buildController(chromeMeshes, 'seagreen', scene.trackers.a, [c0ButtonHandlingTracker, c0Projector]);
        buildController(chromeMeshes, 'royalblue', scene.trackers.b, [c1ButtonHandlingTracker]);        
        
        
        /* === === === Putting some things in the scene === === === */
        /* 
        Let's add some text to the scene by loading meshes representing letters and other typographical characters (aka glyphs) 
        and then creating drawable objects from those meshes, then adding the drawables to the scene.
        */  
        
        /* Some example text, made up of glyphs loaded from meshes */
        var showText = function (textStr, basePos, baseOri, scale, params) {
            var p = params || {};
            // var scale = p.scale || 1.0;
            scale = scale || 1.0;
            var rotQuat = quat.create();
            quat.rotateX(rotQuat, rotQuat, baseOri.x);
            quat.rotateY(rotQuat, rotQuat, baseOri.y);
            quat.rotateZ(rotQuat, rotQuat, baseOri.z);
            var transVec = vec3.fromValues(basePos.x, basePos.y, basePos.z);
            var mat = mat4.create();
            mat4.fromRotationTranslation(mat, rotQuat, transVec);
            
            var glyphPromises = [];
            var xOffset = 0;
            for (var i=0; i<textStr.length; i++) {
                var glyph;
                var meshPath = '//meshbase.meta4vr.net/_typography/lato-bold/glyph_'+textStr.charCodeAt(i)+'.obj';
                glyphPromises.push(FCShapeUtils.loadMesh(meshPath));
            }
            Promise.all(glyphPromises).then(function (meshes) {
                for (var i=0; i<meshes.length; i++) {
                    var mesh = meshes[i];
                    var meshInfo = FCMeshTools.analyseMesh(mesh);
                    glyph = new FCShapes.MeshShape(mesh, {x:xOffset, y:0, z:0}, {scale:scale}, null,
                                {materialLabel:'matteplastic', groupLabel:'letters'});
                    glyph.inheritedMatrix = mat;
                    scene.addObject(glyph);
                    xOffset += meshInfo.maxX*1.2*scale;
                
                }
            });
        }
        

        showText('#virtualreality', {x:2, y:0.3, z:3}, {x:0, y:DEG(180), z:0});
        showText('/meta4vr', {x:-1.7, y:0.3, z:-3}, {x:0, y:0, z:0});
        
        /* Add a facebook icon from a glyph mesh. */
        FCShapeUtils.loadMesh('//meshbase.meta4vr.net/_typography/fontawesome/glyph_'+0xf230+'.obj')
        .then(function (mesh) {
            var fbIcon = new FCShapes.MeshShape(mesh, {x:-2.7, y:0.3, z:-3}, {scale:1.0}, null, {materialLabel:'matteplastic'});
            scene.addObject(fbIcon);
        });
        
    }

    return Scene;
})();
