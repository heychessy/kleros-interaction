pragma solidity ^0.4.24;

import "../arbitration/Arbitrator.sol";
import "../arbitration/Arbitrable.sol";

import "./VersioningProxy.sol";

/**
 *  @title ArbitratorVersioningProxy
 *  @author Enrique Piqueras - <epiquerass@gmail.com>
 *  @dev An Arbitrator proxy that only exposes methods in the Arbitrator spec.
 */
contract ArbitratorVersioningProxy is Arbitrator, Arbitrable, VersioningProxy {
    /* Structs */

    struct DisputeStruct {
        Arbitrable arbitrated;
        uint externalDisputeID;
        Arbitrator arbitrator;
        uint choices;
    }

    /* Storage */

    DisputeStruct[] public disputes;

    mapping(uint => uint) externalDisputeIDToLocalDisputeID;

    /* Constructor */

    /**
     * @dev Constructs the arbitrator versioning proxy with the first arbitrator contract version address and tags it v0.0.1.
     * @param _firstAddress The address of the first arbitrator contract version.
     */
    constructor(Arbitrator _firstAddress) VersioningProxy("0.0.1", _firstAddress) public Arbitrable(Arbitrator(msg.sender), "") {}

    /* Public */

    /** @notice Creates a dispute in the current `implementation` contract. Must be called by the arbitrable contract.
     *  @param _choices The amount of choices the arbitrator can make in this dispute.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return The ID of the created dispute in the context of this contract.
     */
    function createDispute(uint _choices, bytes _extraData) public payable returns(uint _localDisputeID) {
        uint externalDisputeID = Arbitrator(implementation).createDispute.value(msg.value)(_choices, _extraData);
        _localDisputeID = disputes.push(
            DisputeStruct({
                arbitrated: Arbitrable(msg.sender),
                externalDisputeID: externalDisputeID,
                arbitrator: Arbitrator(implementation),
                choices: _choices
            })
        );

        externalDisputeIDToLocalDisputeID[externalDisputeID] = _localDisputeID;
    }

    /** @notice Appeals a ruling to the current `implementation` contract.
     *  @param _localDisputeID The ID of the dispute to be appealed.
     *  @param _extraData Can be used to give extra info on the appeal.
     */
    function appeal(uint _localDisputeID, bytes _extraData) public payable {
        if (disputes[_localDisputeID].arbitrator != implementation) { // Arbitrator has been upgraded, create a new dispute in the new arbitrator
            transferDispute(_localDisputeID, _extraData);
        }
        else{
            Arbitrator(implementation).appeal.value(msg.value)(disputes[_localDisputeID].externalDisputeID, _extraData);
        }
    }

    /* Public Views */

    /** @notice Computes the cost of arbitration in the current `implementation` contract. It is recommended not to increase it often, as it can be highly time and gas consuming for the arbitrated contracts to cope with fee augmentation.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return _fee The arbitration cost.
     */
    function arbitrationCost(bytes _extraData) public view returns(uint _fee) {
        return Arbitrator(implementation).arbitrationCost(_extraData);
    }

    /** @notice Computes the cost of appealing to the current `implementation` contract. It is recommended not to increase it often, as it can be highly time and gas consuming for the arbitrated contracts to cope with fee augmentation.
     *  @param _localDisputeID The ID of the dispute to be appealed.
     *  @param _extraData Can be used to give additional info on the dispute to be created.
     *  @return _fee The appeal cost.
     */
    function appealCost(uint _localDisputeID, bytes _extraData) public view returns(uint _fee) {
        if (disputes[_localDisputeID].arbitrator != implementation) {
            transferDispute(_localDisputeID, _extraData);
        }
        return Arbitrator(implementation).appealCost(disputes[_localDisputeID].externalDisputeID, _extraData);
    }

    function transferDispute(uint _localDisputeID, bytes _extraData) internal {
        uint _choices = disputes[_localDisputeID].choices;
        uint _externalDisputeID = Arbitrator(implementation).createDispute.value(msg.value)(_choices, _extraData);
        disputes[_localDisputeID].arbitrator = Arbitrator(implementation);
        disputes[_localDisputeID].externalDisputeID = _externalDisputeID;
    }

    /** @notice Get the current ruling of a dispute. This is useful for parties to know if they should appeal.
     *  @param _localDisputeID The ID of the dispute.
     *  @return _ruling The current ruling which will be given if there is no appeal or which has been given.
     */
    function currentRuling(uint _localDisputeID) public view returns(uint _ruling) {
        return disputes[_localDisputeID].arbitrator.currentRuling(disputes[_localDisputeID].externalDisputeID);
    }

    /** @notice Get the status of a dispute.
     *  @param _localDisputeID The ID of the dispute.
     *  @return _status The status of the dispute.
     */
    function disputeStatus(uint _localDisputeID) public view returns(Arbitrator.DisputeStatus _status) {
        return disputes[_localDisputeID].arbitrator.disputeStatus(disputes[_localDisputeID].externalDisputeID);
    }

    function rule(uint _externalDisputeID, uint _ruling) public {
        emit Ruling(Arbitrator(msg.sender), _externalDisputeID, _ruling);

        executeRuling(_externalDisputeID, _ruling);
    }

    function executeRuling(uint _externalDisputeID, uint _ruling) internal {
        uint localDisputeID = externalDisputeIDToLocalDisputeID[_externalDisputeID];

        require(disputes[localDisputeID].arbitrator == msg.sender, "The dispute can only be ruled on by its arbitrator.");
        disputes[localDisputeID].arbitrated.rule(_externalDisputeID, _ruling);
    }

}
