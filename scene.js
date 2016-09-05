window.ExperimentalScene = (function () {
    "use strict";
    
    function Scene() {
        /* Declare any class and instance vars unique to this scene, here. */
        FCScene.call(this);
        
        /* Prerequisites are items that will be loaded before the scene setup. The ones defined here will */
        /* be automatically loaded, and scene setup will be forced to wait until they finish loading, so */
        /* anything fundamental to the initialization of the scene should be considered a prerequisite. */
        /* However it is not ideal to make the user wait for too long so be wary of using large */
        /* downloads as prerequisistes. */
        /* Each of the items in scene.prerequisites will be mapped into scene.<thingtype>.<label> once built. */
        this.prerequisites = {
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
               {label: 'controller', src: '//assets.meta4vr.net/mesh/obj/sys/vive/controller/ctrl_lowpoly_body.obj'}
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
        this.lightPool = {
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
        
            
        this.lights = [
            this.lightPool.plainWhiteAmbientOverhead
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
        
        
    }
    
    Scene.prototype = Object.create(FCScene.prototype);
    
    Scene.prototype.setupPrereqs = function () {
        return new Promise(function (resolve, reject) {resolve()});
        
        /* NB: none of this stuff executes since a return already happened above. */
        /* This is because all the things that used to happen in here can now be done */
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
    
    Scene.prototype.setupScene = function () {
        var scene = this;
        var DEG=360/(2*Math.PI);
        var _hidden_beneath_floor = function () {return {x:0, y:-1, z:0};}
        
        console.log('setting up');
        
        /* Cursor */
        var cursor = new FCShapes.SimpleCuboid(
            _hidden_beneath_floor(),
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
            {x:270/DEG, y:0/DEG, z:0/DEG},
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
            {x:270/DEG, y:0/DEG, z:0/DEG},
            {label: 'raft', materialLabel: 'concrete', textureLabel: 'royalblue', segmentsX: 1, segmentsY: 1}
        ));
        
        /* === === === Controllers === === === */
        
        /* Button handler for the controllers. The default button handler does 2 things: */
        /* 1). teleport to cursor location when grip button is pressed */
        /* 2). Output button status info when any button is pressed */
        /* Buttons are - 0: trackpad, 1: trigger 2: grip, 3: menu */
        /* Statuses are: pressed, released, up, held */
        /* up means button is not pressed. */
        /* pressed means the button transitioned from up to down. */
        /* released means the button transitioned from down to up. */
        /* held means the button started down and stayed down */
        /* Buttonhandlers are called once per anim frame. */
        var buttonHandler = function (gamepadIdx, btnIdx, btnStatus, sector, myButton, extra) {
            if (btnStatus != 'up') {
                console.log('Button idx', btnIdx, 'on controller', gamepadIdx, 'was', btnStatus);
                if (btnIdx == 0) {
                    console.log('Sector', sector);
                }
                if (btnIdx == '2' && btnStatus == 'pressed') {
                    scene.teleportUserToCursor();
                }
            }
        };
        
        /* Controller models are added just like any model in the scene; to make them track the controller, */
        /* a special behaviour is added. */
        /* Controller 0 (the green one) also has command of the cursor (having the cursor track both controllers */
        /* can get pretty weird pretty quickly). */
        /* This is the 2nd stage of the 2-stage process mentioned earlier. The cursor projects a ray which is */
        /* configured to interact with a set of colliders, in this case the floorCollider, which has a callback */
        /* which receives info on the collisions that occur so that the cursor can be updated. */
        var ctrl0 = new FCShapes.MeshShape(
            scene.meshes.controller,
            _hidden_beneath_floor(), /* Hide it under the floor. This position will be overridden by the tracking behaviour */
            {scale: 1},
            null,
            {
                materialLabel:'matteplastic',
                textureLabel: 'controllerGreen',
                groupLabel: 'controllerTrackers'
            }
        );
        ctrl0.behaviours.push(FCUtil.makeGamepadTracker(scene, 0, buttonHandler));
        ctrl0.behaviours.push(FCUtil.makeControllerRayProjector(scene, 0, [floorCollider]));
        scene.addObject(ctrl0);
        
        var ctrl1 = new FCShapes.MeshShape(
            scene.meshes.controller,
            _hidden_beneath_floor(), /* Hide it under the floor. This position will be overridden by the tracking behaviour */
            {scale: 1},
            null,
            {
                materialLabel:'matteplastic',
                textureLabel: 'controllerBlue',
                groupLabel: 'controllerTrackers'
            }
        );
        ctrl1.behaviours.push(FCUtil.makeGamepadTracker(scene, 1, buttonHandler));
        scene.addObject(ctrl1);
        
    }

    return Scene;
})();
