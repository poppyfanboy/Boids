import * as THREE from 'three';
import { Boid } from './Boid.js';
import { mirrorInsideAabb, vectorToAabbBoundary } from './util/Aabbs.js';
import Octree from './util/Octree.js';

const DEFAULT_DESIRED_VELOCITY = 1;
const DEFAULT_PERCEPTION_RADIUS = 1;
const DEFAULT_VIEW_ANGLE = Math.PI / 3;

const INFINITE_BOX = new THREE.Box3(
    new THREE.Vector3(-Infinity, -Infinity, -Infinity),
    new THREE.Vector3(Infinity, Infinity, Infinity)
);

/**
 * @property {Number} desiredVelocity effectively how much does the force
 * affect a boid.
 * @property {THREE.Vector3} force
 */
export class BoidBehavior {
    constructor(desiredVelocity = DEFAULT_DESIRED_VELOCITY) {
        this.force = new THREE.Vector3();
        this.desiredVelocity = desiredVelocity;
    }

    /**
     * Needs to be called on every frame, it is assumed that the force
     * computation is performed in this method.
     * @param {Boid} _boid
     */
    update(_boid) {
        this.force.set(0, 0, 0);
    }
}

/**
 * Combines several behaviors.
 */
export class CombinedBehavior extends BoidBehavior {
    /**
     * @param {Array.<BoidBehavior>} behaviorsList
     * @param {Number} maxForce
     */
    constructor(behaviorsList, maxForce) {
        super();

        this.behaviorsList = behaviorsList;
        this.maxForce = maxForce;
    }

    /**
     * @override
     */
    update(boid) {
        this.force.set(0, 0, 0);

        for (let i = 0; i < this.behaviorsList.length; i++) {
            const behavior = this.behaviorsList[i];
            behavior.update(boid);
            this.force.add(behavior.force);
        }

        this.force.normalize().multiplyScalar(this.maxForce);
    }
}

/**
 * Avoid colliding with the bounding box (this force won't affect boids
 * traveling alongside the bounding box).
 */
export class AvoidBox extends BoidBehavior {
    constructor(
        desiredVelocity = DEFAULT_DESIRED_VELOCITY,
        perceptionRadius = DEFAULT_PERCEPTION_RADIUS,
        boundingBox = INFINITE_BOX
    ) {
        super(desiredVelocity);

        this.perceptionRadius = perceptionRadius;
        this.boundingBox = boundingBox;
    }

    /**
     * @override
     */
    update(boid) {
        this.force.set(0, 0, 0);

        const nextPredictedPosition = boid.position.clone().add(
            boid.velocity
                .clone()
                .normalize()
                .multiplyScalar(2 * this.perceptionRadius)
        );

        if (
            this.boundingBox.containsPoint(boid.position) &&
            !this.boundingBox.containsPoint(nextPredictedPosition)
        ) {
            const target = mirrorInsideAabb(nextPredictedPosition, this.boundingBox);
            const desiredVelocity = target
                .clone()
                .sub(boid.position)
                .normalize()
                .multiplyScalar(this.desiredVelocity);

            this.force.add(desiredVelocity.sub(boid.velocity));
        }
    }
}

/**
 * Return inside the bounding box if got outside.
 */
export class ReturnInsideBox extends BoidBehavior {
    constructor(desiredVelocity = DEFAULT_DESIRED_VELOCITY, boundingBox = INFINITE_BOX) {
        super(desiredVelocity);

        this.boundingBox = boundingBox;
    }

    /**
     * @override
     */
    update(boid) {
        this.force.set(0, 0, 0);

        if (!this.boundingBox.containsPoint(boid.position)) {
            const aabbCenter = new THREE.Vector3();
            this.boundingBox.getCenter(aabbCenter);
            const desiredVelocity = aabbCenter
                .sub(boid.position)
                .normalize()
                .multiplyScalar(this.desiredVelocity);

            this.force.add(desiredVelocity.sub(boid.velocity));
        }
    }
}

/**
 * If a boid is too close to the bounding box edge (whilst staying inside),
 * move away from the edge. Particularly this force will affect boids
 * moving alongside the bounding box preventing them from being near the
 * bounding box edges all the time.
 */
export class AvoidBoxEdges extends BoidBehavior {
    constructor(desiredVelocity = DEFAULT_DESIRED_VELOCITY, boundingBox = INFINITE_BOX) {
        super(desiredVelocity);

        this.boundingBox = boundingBox;
    }

    /**
     * @override
     */
    update(boid) {
        this.force.set(0, 0, 0);

        const distanceToBoundary = vectorToAabbBoundary(boid.position, this.boundingBox).length();

        if (this.boundingBox.containsPoint(boid.position) && distanceToBoundary < boid.size) {
            const aabbCenter = new THREE.Vector3();
            const scaleFactor = 1 - distanceToBoundary / boid.size;
            this.boundingBox.getCenter(aabbCenter);
            const desiredVelocity = aabbCenter
                .sub(boid.position)
                .normalize()
                .multiplyScalar(this.desiredVelocity * scaleFactor);

            this.force.add(desiredVelocity.sub(boid.velocity));
        }
    }
}

/**
 * Forces a boid to go away from its neighbors depending on the distance to
 * them.
 */
export class SeparationBehavior extends BoidBehavior {
    /**
     * @param {Octree} boidsOctree
     */
    constructor(
        boidsOctree,
        desiredVelocity = DEFAULT_DESIRED_VELOCITY,
        perceptionRadius = DEFAULT_PERCEPTION_RADIUS,
        boundingBox = INFINITE_BOX
    ) {
        super(desiredVelocity);

        this.boidsOctree = boidsOctree;
        this.perceptionRadius = perceptionRadius;
        this.boundingBox = boundingBox;
    }

    /**
     * @override
     */
    update(boid, otherBoids, otherBoidsMaxDistance) {
        this.force.set(0, 0, 0);

        if (!this.boundingBox.containsPoint(boid.position)) {
            return;
        }

        const desiredVelocity = new THREE.Vector3(0, 0, 0);
        let neighborsCount = 0;
        const updateDesiredVelocity = (otherBoid) => {
            if (otherBoid === boid) {
                return;
            }

            const directionFromOther = boid.position.clone().sub(otherBoid.position);
            const distanceToOther = directionFromOther.length();
            if (distanceToOther < this.perceptionRadius) {
                desiredVelocity.add(
                    directionFromOther
                        .divideScalar(distanceToOther * distanceToOther)
                        .multiplyScalar(this.desiredVelocity)
                );
                neighborsCount++;
            }
        };

        if (otherBoids === undefined || this.perceptionRadius > otherBoidsMaxDistance) {
            this.boidsOctree.queryElementsFromSphere(
                new THREE.Sphere(boid.position, this.perceptionRadius),
                updateDesiredVelocity
            );
        } else {
            for (let i = 0; i < otherBoids.length; i++) {
                if (
                    otherBoidsMaxDistance === this.perceptionRadius ||
                    boid.position.distanceTo(otherBoids[i].position) < this.perceptionRadius
                ) {
                    updateDesiredVelocity(otherBoids[i]);
                }
            }
        }

        if (neighborsCount > 0) {
            this.force.add(desiredVelocity.sub(boid.velocity));
        }
    }
}

/**
 * Pushes a boid in the direction where its *visible* neighbors are. Visible
 * neighbors are those that are close enough and are inside the angle of view of
 * the boid.
 */
export class CohesionBehavior extends BoidBehavior {
    /**
     * @param {Octree} boidsOctree
     */
    constructor(
        boidsOctree,
        desiredVelocity = DEFAULT_DESIRED_VELOCITY,
        perceptionRadius = DEFAULT_PERCEPTION_RADIUS,
        boundingBox = INFINITE_BOX,
        viewAngle = DEFAULT_VIEW_ANGLE
    ) {
        super(desiredVelocity);

        this.boidsOctree = boidsOctree;
        this.perceptionRadius = perceptionRadius;
        this.boundingBox = boundingBox;
        this.viewAngle = Math.abs(viewAngle);
    }

    /**
     * @override
     */
    update(boid, otherBoids, otherBoidsMaxDistance) {
        this.force.set(0, 0, 0);

        if (!this.boundingBox.containsPoint(boid.position)) {
            return;
        }

        const neighborsCenter = new THREE.Vector3(0, 0, 0);
        let neighborsCount = 0;
        const updateNeighborsCenter = (otherBoid) => {
            if (otherBoid === boid) {
                return;
            }

            const directionToOther = otherBoid.position.clone().sub(boid.position);
            if (directionToOther.angleTo(boid.orientation.forward) < this.viewAngle) {
                neighborsCenter.add(otherBoid.position);
                neighborsCount++;
            }
        };

        if (otherBoids === undefined || this.perceptionRadius > otherBoidsMaxDistance) {
            this.boidsOctree.queryElementsFromSphere(
                new THREE.Sphere(boid.position, this.perceptionRadius),
                updateNeighborsCenter
            );
        } else {
            for (let i = 0; i < otherBoids.length; i++) {
                if (
                    otherBoidsMaxDistance === this.perceptionRadius ||
                    boid.position.distanceTo(otherBoids[i]) < this.perceptionRadius
                ) {
                    updateNeighborsCenter(otherBoids[i]);
                }
            }
        }

        if (neighborsCount > 0) {
            neighborsCenter.divideScalar(neighborsCount);
            this.force.add(
                neighborsCenter
                    .sub(boid.position)
                    .sub(boid.velocity)
                    .normalize()
                    .multiplyScalar(this.desiredVelocity)
            );
        }
    }
}

export class AlignmentBehavior extends BoidBehavior {
    /**
     * @param {Octree} boidsOctree
     */
    constructor(
        boidsOctree,
        desiredVelocity = DEFAULT_DESIRED_VELOCITY,
        perceptionRadius = DEFAULT_PERCEPTION_RADIUS,
        boundingBox = INFINITE_BOX
    ) {
        super(desiredVelocity);

        this.boidsOctree = boidsOctree;
        this.perceptionRadius = perceptionRadius;
        this.boundingBox = boundingBox;
    }

    /**
     * @override
     */
    update(boid, otherBoids, otherBoidsMaxDistance) {
        this.force.set(0, 0, 0);

        if (!this.boundingBox.containsPoint(boid.position)) {
            return;
        }

        const desiredVelocity = new THREE.Vector3(0, 0, 0);
        let neighborsCount = 0;
        const updateDesiredVelocity = (otherBoid) => {
            if (otherBoid === boid) {
                return;
            }
            desiredVelocity.add(otherBoid.velocity);
            neighborsCount++;
        };

        if (otherBoids === undefined || this.perceptionRadius > otherBoidsMaxDistance) {
            this.boidsOctree.queryElementsFromSphere(
                new THREE.Sphere(boid.position, this.perceptionRadius),
                updateDesiredVelocity
            );
        } else {
            for (let i = 0; i < otherBoids.length; i++) {
                if (
                    otherBoidsMaxDistance === this.perceptionRadius ||
                    boid.position.distanceTo(otherBoids[i]) < this.perceptionRadius
                ) {
                    updateDesiredVelocity(otherBoids[i]);
                }
            }
        }

        if (neighborsCount > 0) {
            this.force.add(
                desiredVelocity.divideScalar(neighborsCount).multiplyScalar(this.desiredVelocity)
            );
        }
    }
}

/**
 * Since separation, cohesion and alignment all query the octree and they all
 * have almost same perception radii, they can be combined into a single
 * behavior to reduce the number of calls to the octree.
 */
export class SeparationCohesionAlignment extends BoidBehavior {
    constructor(boidsOctree, separation, cohesion, alignment) {
        super();

        this.boidsOctree = boidsOctree;
        this.separation = separation;
        this.cohesion = cohesion;
        this.alignment = alignment;
    }

    update(boid) {
        this.force.set(0, 0, 0);

        let neighborsCount = 0;
        const maxPerceptionRadius = Math.max(
            this.separation.perceptionRadius,
            Math.max(this.cohesion.perceptionRadius, this.alignment.perceptionRadius)
        );
        const neighborBoids = [];
        this.boidsOctree.queryElementsFromSphere(
            new THREE.Sphere(boid.position, maxPerceptionRadius),
            (otherBoid) => {
                if (otherBoid !== boid) {
                    neighborBoids.push(otherBoid);
                    neighborsCount++;
                }
            }
        );

        if (neighborsCount > 0) {
            this.separation.update(boid, neighborBoids, maxPerceptionRadius);
            this.cohesion.update(boid, neighborBoids, maxPerceptionRadius);
            this.alignment.update(boid, neighborBoids, maxPerceptionRadius);

            this.force.add(this.cohesion.force);
            this.force.add(this.alignment.force);
            this.force.add(this.separation.force);
        }
    }
}

export class ThrustBehavior extends BoidBehavior {
    constructor(desiredVelocity = DEFAULT_DESIRED_VELOCITY) {
        super(desiredVelocity);
    }

    /**
     * @override
     */
    update(boid) {
        this.force.copy(boid.orientation.forward.clone().multiplyScalar(this.desiredVelocity));
    }
}
