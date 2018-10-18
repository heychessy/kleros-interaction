/**
 *  @title ArbitrableTokenList
 *  @author Matheus Alencar - <mtsalenc@gmail.com>
 */

pragma solidity ^0.4.24;

import "../composed/MultiPartyInsurableArbitrableAgreementsBase.sol";


/**
 *  @title ArbitrableTokenList
 *  This is a T2CL for tokens. Tokens can be submitted and cleared with a time out for challenging.
 */
contract ArbitrableTokenList is MultiPartyInsurableArbitrableAgreementsBase {

    /* Enums */

    enum ItemStatus {
        Absent, // The item has never been submitted.
        Cleared, // The item has been submitted and the dispute resolution process determined it should not be added or a clearing request has been submitted and the dispute resolution process determined it should be cleared or the clearing was never contested.
        Resubmitted, // The item has been cleared but someone has resubmitted it.
        Registered, // The item has been submitted and the dispute resolution process determined it should be added or the submission was never contested.
        Submitted, // The item has been submitted.
        ClearingRequested, // The item is registered, but someone has requested to remove it.
        PreventiveClearingRequested // The item has never been registered, but someone asked to clear it preemptively to avoid it being shown as not registered during the dispute resolution process.
    }

    /* Structs */

    struct Item {
        ItemStatus status; // Status of the item.
        uint lastAction; // Time of the last action.
        uint balance; // The amount of funds placed at stake for this item. Does not include arbitrationFees.
        uint challengeReward; // The challengeReward for the item, if it is in a pending challenge.
    }

    /* Modifiers */

    modifier onlyT2CLGovernor {require(msg.sender == t2clGovernor, "The caller is not the t2cl governor."); _;}

    /* Events */

    /**
     *  @dev Called when the item's status changes or when it is challenged/resolved.
     *  @param submitter Address of the submitter.
     *  @param challenger Address of the challenger, if any.
     *  @param tokenID The tokenID of the item.
     *  @param status The status of the item.
     *  @param disputed Wether the item is being disputed.
     */
    event ItemStatusChange(
        address indexed submitter,
        address indexed challenger,
        bytes32 indexed tokenID,
        ItemStatus status,
        bool disputed
    );

    /* Storage */

    // Settings
    uint public challengeReward; // The stake deposit required in addition to arbitration fees for challenging a registration or clearing request.
    uint public timeToChallenge; // The time before a request becomes executable if not challenged.
    uint public arbitrationFeesWaitingTime; // The maximum time to wait for arbitration fees if the dispute is raised.
    address public t2clGovernor; // The address that can update t2clGovernor, arbitrationFeesWaitingTime and challengeReward.

    // Ruling Options
    uint8 constant REGISTER = 1;
    uint8 constant CLEAR = 2;

    // Items
    mapping(bytes32 => Item) public items;
    mapping(uint => bytes32) public disputeIDToItemID;
    bytes32[] public itemsList;

    // Agreement and Item Extension
    mapping(bytes32 => uint) public itemIDToAgreementCount;
    mapping(bytes32 => bytes32) public agreementIDtoItemID;

    /* Constructor */

    /**
     *  @dev Constructs the arbitrable token list.
     *  @param _arbitrator The chosen arbitrator.
     *  @param _arbitratorExtraData Extra data for the arbitrator contract.
     *  @param _feeGovernor The fee governor of this contract.
     *  @param _stake The stake parameter for sharing fees.
     *  @param _t2clGovernor The t2clGovernor address. This address can update t2clGovernor, arbitrationFeesWaitingTime and challengeReward.
     *  @param _arbitrationFeesWaitingTime The maximum time to wait for arbitration fees if the dispute is raised.
     *  @param _challengeReward The amount in Weis of deposit required for a submission or a challenge in addition to the arbitration fees.
     *  @param _timeToChallenge The time in seconds, parties have to challenge.
     */
    constructor(
        Arbitrator _arbitrator,
        bytes _arbitratorExtraData,
        address _feeGovernor,
        uint _stake,
        address _t2clGovernor,
        uint _arbitrationFeesWaitingTime,
        uint _challengeReward,
        uint _timeToChallenge
    ) public MultiPartyInsurableArbitrableAgreementsBase(_arbitrator, _arbitratorExtraData, _feeGovernor, _stake){
        challengeReward = _challengeReward;
        timeToChallenge = _timeToChallenge;
        t2clGovernor = _t2clGovernor;
        arbitrationFeesWaitingTime = _arbitrationFeesWaitingTime;
    }

    /* Public */

    /**
     *  @dev Request for an item to be registered.
     *  @param _tokenID The keccak hash of a JSON object with all of the token's properties and no insignificant whitespaces.
     *  @param _metaEvidence The meta evidence for the potential dispute.
     */
    function requestRegistration(
        bytes32 _tokenID,
        string _metaEvidence
    ) external payable {
        Item storage item = items[_tokenID];
        Agreement storage prevAgreement = agreements[latestAgreementId(_tokenID)];
        require(!prevAgreement.disputed || prevAgreement.executed, "There is already a request in place.");
        require(msg.value >= challengeReward, "Not enough ETH.");

        if (item.status == ItemStatus.Absent)
            item.status = ItemStatus.Submitted;
        else if (item.status == ItemStatus.Cleared)
            item.status = ItemStatus.Resubmitted;
        else
            revert("Item in wrong status for registration."); // If the item is neither Absent nor Cleared, it is not possible to request registering it.

        if (item.lastAction == 0) {
            itemsList.push(_tokenID);
        }

        item.balance = challengeReward;
        item.lastAction = now;
        item.challengeReward = challengeReward;

        address[] memory _parties = new address[](2);
        _parties[0] = msg.sender;

        _createAgreement(
            _tokenID,
            _metaEvidence,
            _parties,
            2,
            new bytes(0),
            arbitrationFeesWaitingTime,
            arbitrator
        );

        if(msg.value > challengeReward) msg.sender.transfer(msg.value - challengeReward); // Refund any extra ETH.
        Agreement storage agreement = agreements[latestAgreementId(_tokenID)];
        emit ItemStatusChange(agreement.parties[0], address(0), _tokenID, item.status, agreement.disputed);
    }

    /**
     *  @dev Request an item to be cleared.
     *  @param _tokenID The keccak hash of a JSON object with all of the token's properties and no insignificant whitespaces.
     *  @param _metaEvidence The meta evidence for the potential dispute.
     */
    function requestClearing(
        bytes32 _tokenID,
        string _metaEvidence
    ) external payable {
        Item storage item = items[_tokenID];
        Agreement storage prevAgreement = agreements[latestAgreementId(_tokenID)];
        require(!prevAgreement.disputed || prevAgreement.executed, "There is already a request in place.");
        require(msg.value >= challengeReward, "Not enough ETH.");

        if (item.status == ItemStatus.Registered)
            item.status = ItemStatus.ClearingRequested;
        else if (item.status == ItemStatus.Absent)
            item.status = ItemStatus.PreventiveClearingRequested;
        else
            revert("Item in wrong status for clearing."); // If the item is neither Registered nor Absent, it is not possible to request clearing it.

        if (item.lastAction == 0) {
            itemsList.push(_tokenID);
        }

        item.balance = challengeReward;
        item.lastAction = now;
        item.challengeReward = challengeReward;

        address[] memory _parties = new address[](2);
        _parties[0] = msg.sender;

        _createAgreement(
            _tokenID,
            _metaEvidence,
            _parties,
            2,
            new bytes(0),
            arbitrationFeesWaitingTime,
            arbitrator
        );

        if(msg.value > challengeReward) msg.sender.transfer(msg.value - challengeReward); // Refund any extra eth.
        Agreement storage agreement = agreements[latestAgreementId(_tokenID)];
        emit ItemStatusChange(agreement.parties[0], address(0), _tokenID, item.status, agreement.disputed);
    }

    /** @dev Overrides parent to use information specific to Arbitrable Token List in math:
     *  - Parent's fundDispute doesn't take into account `challengeReward` when calculating ETH.
     *  - For calls that initiate a dispute, msg.value must also include `challengeReward`.
     *  @param _agreementID The ID of the agreement.
     *  @param _side The side. 0 for the side that lost the previous round, if any, and 1 for the one that won.
     */
    function fundDispute(bytes32 _agreementID, uint _side) public payable {
        Agreement storage agreement = agreements[_agreementID];
        PaidFees storage _paidFees = paidFees[_agreementID];
        Item storage item = items[agreementIDtoItemID[_agreementID]];
        require(agreement.creator != address(0), "The specified agreement does not exist.");
        require(!agreement.executed, "You cannot fund disputes for executed agreements.");
        require(
            !agreement.disputed || agreement.arbitrator.disputeStatus(agreement.disputeID) == Arbitrator.DisputeStatus.Appealable,
            "The agreement is already disputed and is not appealable."
        );
        require(_side <= 1, "There are only two sides.");

        // Prepare storage for first call.
        if (_paidFees.firstContributionTime == 0) {
            _paidFees.firstContributionTime = now;
            _paidFees.ruling.push(0);
            _paidFees.stake.push(stake);
            _paidFees.totalValue.push(0);
            _paidFees.totalContributedPerSide.push([0, 0]);
            _paidFees.loserFullyFunded.push(false);
            _paidFees.contributions.length++;
        } else { // Reset cache.
            fundDisputeCache.cost = 0;
            fundDisputeCache.appealing = false;
            (fundDisputeCache.appealPeriodStart, fundDisputeCache.appealPeriodEnd) = (0, 0);
            fundDisputeCache.appealPeriodSupported = false;
            fundDisputeCache.requiredValueForSide = 0;
            fundDisputeCache.expectedValue = 0;
            fundDisputeCache.stillRequiredValueForSide = 0;
            fundDisputeCache.keptValue = 0;
            fundDisputeCache.refundedValue = 0;
        }

        // Check time outs and requirements.
        if (_paidFees.stake.length == 1) { // First round.
            fundDisputeCache.cost = agreement.arbitrator.arbitrationCost(agreement.extraData);

            // Arbitration fees time out.
            if (now - _paidFees.firstContributionTime > agreement.arbitrationFeesWaitingTime) {
                executeAgreementRuling(_agreementID, 0);
                return;
            }
        } else { // Appeal.
            fundDisputeCache.cost = agreement.arbitrator.appealCost(agreement.disputeID, agreement.extraData);

            fundDisputeCache.appealing = true;
            (fundDisputeCache.appealPeriodStart, fundDisputeCache.appealPeriodEnd) = agreement.arbitrator.appealPeriod(agreement.disputeID);
            fundDisputeCache.appealPeriodSupported = fundDisputeCache.appealPeriodStart != 0 && fundDisputeCache.appealPeriodEnd != 0;
            if (fundDisputeCache.appealPeriodSupported) {
                if (now < fundDisputeCache.appealPeriodStart + ((fundDisputeCache.appealPeriodEnd - fundDisputeCache.appealPeriodStart) / 2)) // In the first half of the appeal period.
                    require(_side == 0, "It is the losing side's turn to fund the appeal.");
                else // In the second half of the appeal period.
                    require(
                        _side == 1 && _paidFees.loserFullyFunded[_paidFees.loserFullyFunded.length - 1],
                        "It is the winning side's turn to fund the appeal, only if the losing side already fully funded it."
                    );
            } else require(msg.value >= fundDisputeCache.cost, "Fees must be paid in full if the arbitrator does not support `appealPeriod`.");
        }
        require(msg.value > 0, "The value of the contribution cannot be zero.");

        // Compute required value.
        if (!fundDisputeCache.appealing) { // First round.
            fundDisputeCache.requiredValueForSide = fundDisputeCache.cost / 2;
        } else { // Appeal.
            if (!fundDisputeCache.appealPeriodSupported)
                fundDisputeCache.requiredValueForSide = fundDisputeCache.cost;
            else if (_side == 0) // Losing side.
                fundDisputeCache.requiredValueForSide = fundDisputeCache.cost + (2 * _paidFees.stake[_paidFees.stake.length - 1]);
            else { // Winning side.
                fundDisputeCache.expectedValue = _paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][0] - _paidFees.stake[_paidFees.stake.length - 1];
                fundDisputeCache.requiredValueForSide = fundDisputeCache.cost > _paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][0] + fundDisputeCache.expectedValue ? fundDisputeCache.cost - _paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][0] : fundDisputeCache.expectedValue;
            }
        }

        // Take contribution.
        if (_paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][_side] >= fundDisputeCache.requiredValueForSide)
            fundDisputeCache.stillRequiredValueForSide = 0;
        else
            fundDisputeCache.stillRequiredValueForSide = fundDisputeCache.requiredValueForSide - _paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][_side];


        if(item.balance == item.challengeReward) { // Party is attempting to start a dispute.
            require(msg.value >= item.challengeReward, "Party challenging agreement must place value at stake");
            fundDisputeCache.keptValue = fundDisputeCache.stillRequiredValueForSide >= msg.value - item.challengeReward
                ? msg.value - item.challengeReward
                : fundDisputeCache.stillRequiredValueForSide;
            item.balance += item.challengeReward;
            fundDisputeCache.refundedValue = msg.value - fundDisputeCache.keptValue - item.challengeReward;
            agreement.parties[1] = msg.sender;
        } else { // Party that started attempt to raise dispute already placed value at stake.
            fundDisputeCache.keptValue = fundDisputeCache.stillRequiredValueForSide >= msg.value
                ? msg.value
                : fundDisputeCache.stillRequiredValueForSide;
            fundDisputeCache.refundedValue = msg.value - fundDisputeCache.keptValue;
        }

        if (fundDisputeCache.keptValue > 0) {
            _paidFees.totalValue[_paidFees.totalValue.length - 1] += fundDisputeCache.keptValue;
            _paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][_side] += fundDisputeCache.keptValue;
            _paidFees.contributions[_paidFees.contributions.length - 1][msg.sender][_side] += fundDisputeCache.keptValue;
        }
        if (fundDisputeCache.refundedValue > 0) msg.sender.transfer(fundDisputeCache.refundedValue);
        emit Contribution(_agreementID, _paidFees.stake.length - 1, msg.sender, fundDisputeCache.keptValue);

        // Check if enough funds have been gathered and act accordingly.
        if (
            _paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][_side] >= fundDisputeCache.requiredValueForSide ||
            (fundDisputeCache.appealing && !fundDisputeCache.appealPeriodSupported)
        ) {
            if (_side == 0 && (fundDisputeCache.appealing ? fundDisputeCache.appealPeriodSupported : _paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][1] < fundDisputeCache.requiredValueForSide)) { // Losing side and not direct appeal or dispute raise.
                if (!_paidFees.loserFullyFunded[_paidFees.loserFullyFunded.length - 1])
                    _paidFees.loserFullyFunded[_paidFees.loserFullyFunded.length - 1] = true;
            } else { // Winning side or direct appeal.
                if (!fundDisputeCache.appealing) { // First round.
                    if (_paidFees.totalContributedPerSide[_paidFees.totalContributedPerSide.length - 1][_side == 0 ? 1 : 0] < fundDisputeCache.requiredValueForSide) return;
                    agreement.disputeID = agreement.arbitrator.createDispute.value(fundDisputeCache.cost)(agreement.numberOfChoices, agreement.extraData);
                    agreement.disputed = true;
                    disputeIDToItemID[agreement.disputeID] = agreementIDtoItemID[_agreementID];
                    arbitratorAndDisputeIDToAgreementID[agreement.arbitrator][agreement.disputeID] = _agreementID;
                    emit Dispute(agreement.arbitrator, agreement.disputeID, uint(_agreementID));
                } else { // Appeal.
                    _paidFees.ruling[_paidFees.ruling.length - 1] = agreement.arbitrator.currentRuling(agreement.disputeID);
                    agreement.arbitrator.appeal.value(fundDisputeCache.cost)(agreement.disputeID, agreement.extraData);
                    if (!agreement.appealed) agreement.appealed = true;
                }

                // Update the total value.
                _paidFees.totalValue[_paidFees.totalValue.length - 1] -= fundDisputeCache.cost;

                // Prepare for the next round.
                _paidFees.ruling.push(0);
                _paidFees.stake.push(stake);
                _paidFees.totalValue.push(0);
                _paidFees.totalContributedPerSide.push([0, 0]);
                _paidFees.loserFullyFunded.push(false);
                _paidFees.contributions.length++;
            }
        }
    }

    /**
     *  @dev Execute a request after the time for challenging it has passed. Can be called by anyone.
     *  @param _tokenID The tokenID of the item with the request to execute.
     */
    function executeRequest(bytes32 _tokenID) external {
        Item storage item = items[_tokenID];
        bytes32 agreementID = latestAgreementId(_tokenID);
        Agreement storage agreement = agreements[agreementID];
        require(now - item.lastAction > timeToChallenge, "The time to challenge has not passed yet.");
        require(agreement.creator != address(0), "The specified agreement does not exist.");
        require(!agreement.executed, "The specified agreement has already been executed.");
        require(!agreement.disputed, "The specified agreement is disputed.");
        agreement.executed = true;

        if (item.status == ItemStatus.Resubmitted || item.status == ItemStatus.Submitted)
            item.status = ItemStatus.Registered;
        else if (item.status == ItemStatus.ClearingRequested || item.status == ItemStatus.PreventiveClearingRequested)
            item.status = ItemStatus.Cleared;
        else
            revert("Item in wrong status for executing request.");

        item.challengeReward = 0; // Clear challengeReward once a dispute is resolved.
        item.lastAction = now;
        agreement.parties[0].send(item.balance); // Deliberate use of send in order to not block the contract in case of reverting fallback.
        item.balance = 0;

        emit ItemStatusChange(agreement.parties[0], address(0), _tokenID, item.status, agreement.disputed);
    }

    /** @dev Changes the `challengeReward` storage variable.
     *  @param _challengeReward The new `challengeReward` storage variable.
     */
    function changeChallengeReward(uint _challengeReward) external onlyT2CLGovernor {
        challengeReward = _challengeReward;
    }

    /** @dev Changes the `t2clGovernor` storage variable.
     *  @param _t2clGovernor The new `t2clGovernor` storage variable.
     */
    function changeT2CLGovernor(address _t2clGovernor) external onlyT2CLGovernor {
        t2clGovernor = _t2clGovernor;
    }

    /** @dev Changes the `arbitrationFeesWaitingTime` storage variable.
     *  @param _arbitrationFeesWaitingTime The new `_arbitrationFeesWaitingTime` storage variable.
     */
    function changeArbitrationFeesWaitingTime(uint _arbitrationFeesWaitingTime) external onlyT2CLGovernor {
        arbitrationFeesWaitingTime = _arbitrationFeesWaitingTime;
    }

    /* Public Views */

    /**
     *  @dev Returns the latest agreement for an item
     *  @param _tokenID The tokenID of the item to check.
     *  @return The latest agreementID
     */
    function latestAgreementId(bytes32 _tokenID) public view returns (bytes32) {
        return keccak256(abi.encodePacked(_tokenID, itemIDToAgreementCount[_tokenID]));
    }

    /**
     *  @dev Return true if the item is allowed.
     *  We consider the item to be in the list if its status is contested and it has not won a dispute previously.
     *  @param _tokenID The tokenID of the item to check.
     *  @return allowed True if the item is allowed, false otherwise.
     */
    function isPermitted(bytes32 _tokenID) public view returns (bool allowed) {
        Item storage item = items[_tokenID];
        return item.status == ItemStatus.Registered || item.status == ItemStatus.ClearingRequested;
    }

    /* Internal */

    /** @dev Extends parent to use counter identify agreements.
     *  @param _tokenID The item id.
     *  @param _metaEvidence The meta evidence of the agreement.
     *  @param _parties The `parties` value of the agreement.
     *  @param _numberOfChoices The `numberOfChoices` value of the agreement.
     *  @param _extraData The `extraData` value of the agreement.
     *  @param _arbitrationFeesWaitingTime The `arbitrationFeesWaitingTime` value of the agreement.
     *  @param _arbitrator The `arbitrator` value of the agreement.
     */
    function _createAgreement(
        bytes32 _tokenID,
        string _metaEvidence,
        address[] _parties,
        uint _numberOfChoices,
        bytes _extraData,
        uint _arbitrationFeesWaitingTime,
        Arbitrator _arbitrator
    ) internal {
        itemIDToAgreementCount[_tokenID]++;
        bytes32 agreementID = keccak256(abi.encodePacked(_tokenID, itemIDToAgreementCount[_tokenID]));
        agreementIDtoItemID[agreementID] = _tokenID;

        super._createAgreement(
            agreementID,
            _metaEvidence,
            _parties,
            _numberOfChoices,
            _extraData,
            _arbitrationFeesWaitingTime,
            _arbitrator
        );
    }

    /** @dev Executes the ruling on the specified agreement.
     *  @param _agreementID The ID of the agreement.
     *  @param _ruling The ruling.
     */
    function executeAgreementRuling(bytes32 _agreementID, uint _ruling) internal {
        super.executeAgreementRuling(_agreementID, _ruling);
        uint256 disputeID = agreements[_agreementID].disputeID;
        Item storage item = items[disputeIDToItemID[disputeID]];
        Agreement storage agreement = agreements[_agreementID];
        require(agreement.disputed, "The item is not disputed.");

        if (_ruling == REGISTER) {
            if (item.status == ItemStatus.Resubmitted || item.status == ItemStatus.Submitted)
                agreement.parties[0].send(item.balance); // Deliberate use of send in order to not block the contract in case of reverting fallback.
            else
                agreement.parties[1].send(item.balance);

            item.status = ItemStatus.Registered;
        } else if (_ruling == CLEAR) {
            if (item.status == ItemStatus.PreventiveClearingRequested || item.status == ItemStatus.ClearingRequested)
                agreement.parties[0].send(item.balance);
            else
                agreement.parties[1].send(item.balance);

            item.status = ItemStatus.Cleared;
        } else { // Split the balance 50-50 and give the item the initial status.
            if (item.status == ItemStatus.Resubmitted)
                item.status = ItemStatus.Cleared;
            else if (item.status == ItemStatus.ClearingRequested)
                item.status = ItemStatus.Registered;
            else
                item.status = ItemStatus.Absent;

            agreement.parties[0].send(item.balance / 2);
            agreement.parties[1].send(item.balance / 2);
        }

        agreement.disputed = false;
        item.balance = 0;
        agreement.parties[1] = 0x0; // Dispute has been resolved, reset challenger.
        item.challengeReward = 0; // Clear challengeReward once a dispute is resolved.

        emit ItemStatusChange(agreement.parties[0], agreement.parties[1], disputeIDToItemID[disputeID], item.status, agreement.disputed);
    }

    /* Interface Views */

    /**
     *  @dev Return the number of items in the list.
     *  @return The number of items in the list.
     */
    function itemsCount() public view returns (uint) {
        return itemsList.length;
    }

    /**
     *  @dev Return the numbers of items in the list per status.
     *  @return The numbers of items in the list per status.
     */
    function itemsCounts() external view returns (uint pending, uint challenged, uint accepted, uint rejected) {
        for (uint i = 0; i < itemsList.length; i++) {
            Item storage item = items[itemsList[i]];
            Agreement storage latestAgreement = agreements[latestAgreementId(itemsList[i])];
            if (latestAgreement.disputed) challenged++;
            else if (item.status == ItemStatus.Resubmitted || item.status == ItemStatus.Submitted) pending++;
            else if (item.status == ItemStatus.Registered) accepted++;
            else if (item.status == ItemStatus.Cleared) rejected++;
        }
    }

    /**
     *  @dev Return the values of the items the query finds.
     *  This function is O(n) at worst, where n is the number of items. This could exceed the gas limit, therefore this function should only be used for interface display and not by other contracts.
     *  @param _cursor The pagination cursor.
     *  @param _count The number of items to return.
     *  @param _filter The filter to use.
     *  @param _sort The sort order to use.
     *  @return The values of the items found and wether there are more items for the current filter and sort.
     */
    function queryItems(bytes32 _cursor, uint _count, bool[6] _filter, bool _sort) external view returns (bytes32[] values, bool hasMore) {
        uint _cursorIndex;
        values = new bytes32[](_count);
        uint _index = 0;

        if (_cursor == 0)
            _cursorIndex = 0;
        else {
            for (uint j = 0; j < itemsList.length; j++) {
                if (itemsList[j] == _cursor) {
                    _cursorIndex = j;
                    break;
                }
            }
            require(_cursorIndex != 0, "The cursor is invalid.");
        }

        for (
                uint i = _cursorIndex == 0 ? (_sort ? 0 : 1) : (_sort ? _cursorIndex + 1 : itemsList.length - _cursorIndex + 1);
                _sort ? i < itemsList.length : i <= itemsList.length;
                i++
            ) { // Oldest or newest first.
            bytes32 itemID = itemsList[_sort ? i : itemsList.length - i];
            Item storage item = items[itemID];
            bytes32 agreementId = latestAgreementId(itemID);
            Agreement storage agreement = agreements[agreementId];
            if (
                    // solium-disable-next-line operator-whitespace
                    item.status != ItemStatus.Absent && item.status != ItemStatus.PreventiveClearingRequested && (
                    // solium-disable-next-line operator-whitespace
                    (_filter[0] && (item.status == ItemStatus.Resubmitted || item.status == ItemStatus.Submitted)) || // Pending.
                    (_filter[1] && agreement.disputed) || // Challenged.
                    (_filter[2] && item.status == ItemStatus.Registered) || // Accepted.
                    (_filter[3] && item.status == ItemStatus.Cleared) || // Rejected.
                    (_filter[4] && agreement.parties[0] == msg.sender) || // My Submissions.
                    (_filter[5] && agreement.parties[1] == msg.sender) // My Challenges.
                )
            ) {
                if (_index < _count) {
                    values[_index] = itemsList[_sort ? i : itemsList.length - i];
                    _index++;
                } else {
                    hasMore = true;
                    break;
                }
            }
        }
    }

}
